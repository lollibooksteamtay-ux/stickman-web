#!/usr/bin/env python3
"""B5: ghép ảnh + voice + chữ + nhạc -> video dọc 1080x1920.
Chạy: python3 scripts/b5-ghep.py jobs/<ten-job> [file-nhạc]
Thời lượng mỗi cảnh = thời lượng voice cảnh đó + đệm; không có voice thì 3s.
Chữ kiểu "Thì Thầm": in hoa đậm trên đầu khung. Nhạc lấy từ assets/nhac/.
"""
import json
import os
import pathlib
import random
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
FF = "/opt/homebrew/opt/ffmpeg-full/bin/ffmpeg"      # bản có libass (xem video-studio/philosophy/skills.md)
FP = "/opt/homebrew/opt/ffmpeg-full/bin/ffprobe"
if not pathlib.Path(FF).exists():
    FF, FP = "ffmpeg", "ffprobe"

PAD = float(os.environ.get("PAD_DOC", "0.25"))   # đệm sau mỗi câu đọc (giây) — giảm để video không lê thê
ZOOM = os.environ.get("ZOOM", "1") == "1"        # hiệu ứng zoom chậm từng cảnh
ZOOM_MUC = float(os.environ.get("ZOOM_MUC", "0.10"))  # biên độ zoom trong cảnh (12% quanh tâm từng bị chê; giờ có lia máy nên chia nhau chuyển động)
FADE = float(os.environ.get("FADE_CANH", "0.22"))     # giây fade chuyển cảnh (0 = tắt)
MAX_CANH = float(os.environ.get("MAX_CANH", "9.0"))   # cảnh dài hơn mức này mới cần vẽ thêm ảnh
PAN = os.environ.get("PAN", "1") == "1"              # máy quay trôi ngang/dọc trong cảnh cho đỡ nhàm
ZOOM_NEN = float(os.environ.get("ZOOM_NEN", "1.12"))  # zoom nền khi bật PAN — cần biên để lia máy
CHONG_MO = os.environ.get("CHONG_MO", "1") == "1"     # chuyển cảnh chồng mờ (hình trước tan vào hình sau)
XF = float(os.environ.get("CHONG_MO_GIAY", "0.45"))   # độ dài cú chuyển cảnh
CHUYEN = [x for x in os.environ.get("CHUYEN_CANH", "fade,dissolve,smoothleft,fade,dissolve,smoothup").split(",") if x]
CANH_KHONG_LOI = 3.0
BRAND = os.environ.get("BRAND", "")          # chữ ký đáy khung, vd "Thì Thầm" — để trống nếu chưa có tên kênh
NHAC_VOL = float(os.environ.get("NHAC_VOL", "0.18"))


def doc_env():
    envf = ROOT / ".env"
    if envf.exists():
        for line in envf.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip())


doc_env()
# Font: Mac có Avenir Next, Linux dùng Noto Sans (đã kiểm chứng đủ dấu tiếng Việt trước khi deploy)
FONT_CHU = os.environ.get("FONT_CHU", "Noto Sans")
FONT_BRAND = os.environ.get("FONT_BRAND", FONT_CHU)
# Màu chữ hex RRGGBB (.env CHU_MAU) -> định dạng ASS &H00BBGGRR
_hex = os.environ.get("CHU_MAU", "FFFFFF").strip().lstrip("#")
CHU_ASS = f"&H00{_hex[4:6]}{_hex[2:4]}{_hex[0:2]}" if len(_hex) == 6 else "&H00FFFFFF"
_hc = os.environ.get("CHU_CHO", "6E6E6E").strip().lstrip("#")
CHO_ASS = f"&H00{_hc[4:6]}{_hc[2:4]}{_hc[0:2]}" if len(_hc) == 6 else "&H006E6E6E"


def run(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        sys.exit(f"❌ ffmpeg lỗi:\n{r.stderr[-1500:]}")


def dur(path):
    r = subprocess.run([FP, "-v", "error", "-show_entries", "format=duration",
                        "-of", "csv=p=0", str(path)], capture_output=True, text=True)
    return float(r.stdout.strip())


MAX_DONG = int(os.environ.get("SUB_DONG", "2"))          # tối đa 2 dòng/khối (3 khi thời gian eo hẹp)
MAX_KY_TU_DONG = int(os.environ.get("SUB_KY_TU", "26"))  # ký tự/dòng — đã render thử, không tràn mép khung
MIN_HIEN = float(os.environ.get("SUB_MIN_HIEN", "0.7"))  # giây tối thiểu 1 khối phải nằm trên màn hình
KARAOKE = os.environ.get("KARAOKE", "0") == "1"          # TẮT: anh Tây thấy chữ chưa chạy hết đã cắt cảnh (06/08)
CHU_CHO_HEX = os.environ.get("CHU_CHO", "6E6E6E")        # màu từ CHƯA đọc tới (xám)


def _bo_dong(tu, rong):
    dong, cac_dong = "", []
    for t in tu:
        if len(dong) + len(t) + 1 > rong and dong:
            cac_dong.append(dong)
            dong = t
        else:
            dong = f"{dong} {t}".strip()
    if dong:
        cac_dong.append(dong)
    return cac_dong


def be_dong(s, max_ky_tu=MAX_KY_TU_DONG):
    """Bẻ câu thành các dòng DÀI GẦN BẰNG NHAU — không để dòng cuối trơ trọi 1 từ.
    (Bẻ tham lam kiểu cũ sinh ra dòng lẻ 1 từ → khối sub chỉ hiện 0,2s, mắt không thấy.)"""
    tu = s.split()
    if not tu:
        return []
    so_dong_min = max(1, -(-len(s) // max_ky_tu))          # ceil
    for so_dong in range(so_dong_min, so_dong_min + 4):
        rong_can = -(-len(s) // so_dong)                    # chia đều ký tự cho các dòng
        for rong in range(rong_can, max_ky_tu + 1):
            kq = _bo_dong(tu, rong)
            if len(kq) <= so_dong:
                return kq
    return _bo_dong(tu, max_ky_tu)


def karaoke(text_khoi, giay):
    """Bọc từng TỪ bằng thẻ karaoke ASS \\kf — chữ sáng dần theo nhịp đọc.
    Chia thời gian cho từng từ theo độ dài từ (dài hơn thì đọc lâu hơn).
    Đơn vị \\kf là 1/100 giây (centisecond)."""
    dong = text_khoi.split("\\N")
    tat_ca = [w for d in dong for w in d.split()]
    if not tat_ca:
        return text_khoi
    tong = sum(len(w) for w in tat_ca) or 1
    cs_con = max(int(giay * 100), len(tat_ca))
    ra = []
    for idx_d, d in enumerate(dong):
        phan = []
        tu = d.split()
        for j, w in enumerate(tu):
            cuoi_het = (idx_d == len(dong) - 1 and j == len(tu) - 1)
            cs = cs_con if cuoi_het else max(int(round(len(w) / tong * giay * 100)), 8)
            cs = min(cs, cs_con)
            cs_con -= cs
            phan.append(f"{{\\kf{cs}}}{w}")
        ra.append(" ".join(phan))
    return "\\N".join(ra)


def chia_khoi_theo_gio(s, thoi_luong):
    """Chia lời thoại thành các khối sub + mốc thời gian, bảo đảm:
    - không mất chữ nào
    - mỗi khối hiện ÍT NHẤT MIN_HIEN giây (nếu chật thì dồn nhiều dòng vào 1 khối)
    Trả về list [(bat_dau_tuong_doi, ket_thuc_tuong_doi, text_ass)].
    """
    cac_dong = be_dong(s)
    if not cac_dong:
        return []
    # Số khối tối đa mà thời lượng cảnh cho phép (mỗi khối phải đủ MIN_HIEN giây)
    toi_da = max(1, int(thoi_luong // MIN_HIEN))
    so_khoi = min(-(-len(cac_dong) // MAX_DONG), toi_da)
    # Chia số dòng cho các khối cho đều (dư thì các khối đầu nhận thêm 1 dòng)
    goc, du = divmod(len(cac_dong), so_khoi)
    khoi, vt = [], 0
    for k in range(so_khoi):
        lay = goc + (1 if k < du else 0)
        khoi.append("\\N".join(cac_dong[vt:vt + lay]))
        vt += lay
    # Thời gian: mỗi khối được MIN_HIEN, phần còn lại chia theo độ dài chữ
    tong_ky_tu = sum(len(k) for k in khoi) or 1
    con_lai = max(thoi_luong - so_khoi * MIN_HIEN, 0)
    kq, t0 = [], 0.0
    for k in khoi:
        d = MIN_HIEN + con_lai * (len(k) / tong_ky_tu) if con_lai else thoi_luong / so_khoi
        kq.append((t0, min(t0 + d, thoi_luong), k))
        t0 += d
    return kq


def ts(giay):
    h, m = divmod(int(giay // 60), 60)
    s = giay % 60
    return f"{h}:{m:02d}:{s:05.2f}"


job = pathlib.Path(sys.argv[1]).expanduser()
data = json.loads((job / "phan-tich.json").read_text())
tmp = job / "tmp"
tmp.mkdir(exist_ok=True)

# Nhạc: tham số 2 > biến NHAC > nhóm NHAC_NHOM > ngẫu nhiên toàn kho. NHAC_NHOM="khong" = tắt nhạc.
DUOI_NHAC = (".mp3", ".m4a", ".wav", ".aac")
nhac = None
NHAC_NHOM = os.environ.get("NHAC_NHOM", "").strip()
if len(sys.argv) > 2:
    nhac = pathlib.Path(sys.argv[2])
elif os.environ.get("NHAC"):
    nhac = pathlib.Path(os.environ["NHAC"])
elif NHAC_NHOM != "khong":
    kho = ROOT / "assets" / "nhac"
    goc_tim = kho / NHAC_NHOM if NHAC_NHOM and (kho / NHAC_NHOM).is_dir() else kho
    ds = [f for f in sorted(goc_tim.rglob("*.*")) if f.suffix.lower() in DUOI_NHAC]
    if not ds:  # nhóm rỗng thì lấy toàn kho cho video không bị câm
        ds = [f for f in sorted(kho.rglob("*.*")) if f.suffix.lower() in DUOI_NHAC]
    if ds:
        nhac = random.choice(ds)

# Chế độ audio người dùng: VOICE_FILE = file audio gốc, thời lượng cảnh theo mốc bat_dau/ket_thuc
VOICE_FILE = os.environ.get("VOICE_FILE", "").strip()
if VOICE_FILE and not pathlib.Path(VOICE_FILE).exists():
    sys.exit(f"❌ Không thấy file audio: {VOICE_FILE}")
audio_tong = dur(VOICE_FILE) if VOICE_FILE else 0.0

# 6 hướng máy quay, mỗi cảnh 1 hướng → hình đứng 6-9 giây vẫn thấy chuyển động
HUONG = [
    # cy = vị trí khung ngắm theo chiều dọc (0 = sát đỉnh ảnh, 1 = sát đáy).
    # ⚠️ cy CÀNG LỚN thì hình càng dâng lên dải phụ đề ở 25% đỉnh khung → chặn cy ≤ 0,55.
    # Ngược lại cy nhỏ giữ dải đỉnh còn trống hơn cả khi không zoom.
    ("vao", 0.5, 0.05),    # zoom vào, khung ngắm dâng lên đỉnh
    ("ra", 0.5, 0.55),     # zoom ra, khung ngắm hạ xuống (mức chặn)
    ("vao", 0.08, 0.30),   # zoom vào, lia sang trái
    ("ra", 0.92, 0.30),    # zoom ra, lia sang phải
    ("vao", 0.90, 0.08),   # zoom vào chéo phải-trên
    ("ra", 0.10, 0.52),    # zoom ra chéo trái-dưới
]


def vf_zoom(dsub, zbase, zoom_vao=True, fade_dau=False, fade_cuoi=False, huong=0):
    """1 đoạn hình: zoom chậm + máy quay TRÔI dần tới điểm ngắm (pan) + fade nếu cần.
    Lưu ý zoompan: biên trôi ngang = iw - iw/zoom → ở zoom 1.0 biên BẰNG 0, không lia được.
    Vì vậy khi bật PAN phải zoom nền tối thiểu ZOOM_NEN để có chỗ mà lia."""
    if ZOOM:
        kieu, cx, cy = HUONG[huong % len(HUONG)] if PAN else ("vao" if zoom_vao else "ra", 0.5, 0.5)
        if PAN:
            zbase = max(zbase, ZOOM_NEN)
        buoc = ZOOM_MUC / max(dsub * 30, 1)
        if kieu == "vao":
            z = f"min({zbase:.3f}+{buoc:.6f}*on,{zbase + ZOOM_MUC:.3f})"
        else:
            z = f"max({zbase + ZOOM_MUC:.3f}-{buoc:.6f}*on,{zbase:.3f})"
        # Điểm ngắm trôi từ giữa tới (cx, cy) — tính THEO BIÊN CHO PHÉP nên không bao giờ kẹt mép
        tien = f"min(on/{max(dsub * 30, 1):.1f},1)"
        px = f"(0.5+({cx:.3f}-0.5)*{tien})"
        py = f"(0.5+({cy:.3f}-0.5)*{tien})"
        v = ("scale=2160:3840:force_original_aspect_ratio=increase,crop=2160:3840,"
             f"zoompan=z='{z}':d=1:x='(iw-iw/zoom)*{px}':y='(ih-ih/zoom)*{py}':s=1080x1920:fps=30")
    else:
        v = "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,fps=30"
    if FADE > 0 and dsub > FADE * 3:
        if fade_dau:
            v += f",fade=t=in:st=0:d={FADE:.2f}"
        if fade_cuoi:
            v += f",fade=t=out:st={dsub - FADE:.2f}:d={FADE:.2f}"
    return v


# 1) Dựng từng cảnh — HÌNH và TIẾNG tách riêng.
# Vì sao tách: chuyển cảnh chồng mờ (xfade) làm video NGẮN lại (mỗi cú chuyển ăn mất XF giây)
# → nếu ghép sẵn tiếng vào từng cảnh thì hình sẽ lệch dần khỏi tiếng. Cách làm: mỗi cảnh (trừ cảnh
# cuối) được dựng dài thêm đúng XF giây làm "đuôi" cho cú chồng mờ ăn, nên tổng vẫn khớp tiếng.
hinh_parts, tieng_parts, moc, t = [], [], [], 0.0
so_canh = len(data["canh"])
for idx, c in enumerate(data["canh"]):
    i = c["so_thu_tu"]
    anh = job / "anh" / f"canh-{i:02d}.png"
    voice = job / "voice" / f"canh-{i:02d}.wav"
    if not anh.exists():
        sys.exit(f"❌ Thiếu {anh} — chạy lại B3")

    nguon_tieng = None
    if VOICE_FILE:
        # Khớp theo mốc thời gian trong audio; cảnh cuối kéo tới hết audio (không cụt tiếng)
        bd = float(c.get("bat_dau", t))
        kt = float(c.get("ket_thuc", bd + CANH_KHONG_LOI))
        if idx == so_canh - 1 and audio_tong > kt:
            kt = audio_tong
        d = max(kt - bd, 0.8)
    elif voice.exists():
        d = dur(voice) + PAD
        nguon_tieng = voice
    else:
        d = CANH_KHONG_LOI

    # Tiếng của cảnh: luôn đúng d giây (chế độ audio người dùng thì đây chỉ là chỗ giữ nhịp)
    ta = tmp / f"tieng-{i:02d}.wav"
    if nguon_tieng:
        run([FF, "-y", "-loglevel", "error", "-i", str(nguon_tieng),
             "-af", f"apad=whole_dur={d:.3f}", "-t", f"{d:.3f}",
             "-ac", "1", "-ar", "24000", "-c:a", "pcm_s16le", str(ta)])
    else:
        run([FF, "-y", "-loglevel", "error", "-f", "lavfi",
             "-i", f"anullsrc=r=24000:cl=mono:d={d:.3f}", "-t", f"{d:.3f}",
             "-ac", "1", "-ar", "24000", "-c:a", "pcm_s16le", str(ta)])
    tieng_parts.append(ta)

    co_chong_mo = CHONG_MO and so_canh > 1
    duoi = XF if (co_chong_mo and idx < so_canh - 1) else 0.0
    dv = d + duoi
    # Chồng mờ thì chỉ cảnh đầu mở từ đen và cảnh cuối tắt về đen; giữa các cảnh là chồng mờ
    f_dau = (idx == 0) if co_chong_mo else True
    f_cuoi = (idx == so_canh - 1) if co_chong_mo else True

    # Cảnh dài: B3 đã vẽ thêm ảnh phụ (canh-08-b.png, -c.png…) → mỗi đoạn dùng 1 ẢNH KHÁC.
    # Nếu vì lý do gì thiếu ảnh phụ thì đổi cỡ máy trên ảnh cũ để đỡ đứng im (phương án dự phòng).
    anh_phu = [anh]
    for hau in "bcd":
        pp = job / "anh" / f"canh-{i:02d}-{hau}.png"
        if pp.exists():
            anh_phu.append(pp)
    n_sub = 1 if d <= MAX_CANH * 1.15 else min(int(-(-d // MAX_CANH)), max(len(anh_phu), 1) if len(anh_phu) > 1 else 4)
    hv = tmp / f"hinh-{i:02d}.mp4"
    if n_sub == 1:
        run([FF, "-y", "-loglevel", "error", "-loop", "1", "-framerate", "30", "-t", f"{dv:.3f}", "-i", str(anh),
             "-vf", vf_zoom(dv, 1.0, idx % 2 == 0, f_dau, f_cuoi, huong=idx),
             "-an", "-t", f"{dv:.3f}",
             "-c:v", "libx264", "-crf", "20", "-preset", "veryfast", "-pix_fmt", "yuv420p", str(hv)])
    else:
        du_anh = len(anh_phu) >= n_sub
        CO_MAY = [1.0, 1.22, 1.11, 1.30]      # chỉ dùng khi thiếu ảnh phụ
        d_sub = dv / n_sub
        phan = []
        for k in range(n_sub):
            pv = tmp / f"hinh-{i:02d}-{k}.mp4"
            anh_k = anh_phu[k] if du_anh else anh_phu[k % len(anh_phu)]
            zb = 1.0 if du_anh else CO_MAY[k % len(CO_MAY)]
            run([FF, "-y", "-loglevel", "error", "-loop", "1", "-framerate", "30", "-t", f"{d_sub:.3f}", "-i", str(anh_k),
                 "-vf", vf_zoom(d_sub, zb, k % 2 == 0,
                                fade_dau=(k == 0 and f_dau), fade_cuoi=(k == n_sub - 1 and f_cuoi),
                                huong=idx + k),
                 "-an", "-t", f"{d_sub:.3f}",
                 "-c:v", "libx264", "-crf", "20", "-preset", "veryfast", "-pix_fmt", "yuv420p", str(pv)])
            phan.append(pv)
        lst_sub = tmp / f"list-{i:02d}.txt"
        lst_sub.write_text("".join(f"file '{q.resolve()}'\n" for q in phan))
        run([FF, "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", str(lst_sub),
             "-c", "copy", str(hv)])
        print(f"     cảnh {i} dài {d:.1f}s → {n_sub} đoạn ({'ảnh riêng' if du_anh else 'đổi cỡ máy'})")
    hinh_parts.append(hv)
    moc.append((t, t + d, c.get("loi_thoai", "")))
    t += d
    print(f"  ✅ cảnh {i}: {d:.1f}s")

# 2) Nối tiếng (liền mạch, KHÔNG chồng mờ tiếng — sẽ mất chữ) rồi nối hình
if len(tieng_parts) == 1:
    tieng = tieng_parts[0]
else:
    tieng = tmp / "tieng.wav"
    vao = [x for q in tieng_parts for x in ("-i", str(q))]
    fc = "".join(f"[{k}:a]" for k in range(len(tieng_parts))) + f"concat=n={len(tieng_parts)}:v=0:a=1[a]"
    run([FF, "-y", "-loglevel", "error", *vao, "-filter_complex", fc,
         "-map", "[a]", "-ac", "1", "-ar", "24000", "-c:a", "pcm_s16le", str(tieng)])

hinh = tmp / "hinh.mp4"
if CHONG_MO and len(hinh_parts) > 1:
    vao = [x for q in hinh_parts for x in ("-i", str(q))]
    buoc_fc, cur, moc_t = [], "0:v", 0.0
    for k in range(1, len(hinh_parts)):
        moc_t = moc[k - 1][1]                       # cú chuyển bắt đầu đúng lúc cảnh k đáng lẽ vào
        kieu = CHUYEN[(k - 1) % len(CHUYEN)]
        ra = f"x{k}"
        buoc_fc.append(f"[{cur}][{k}:v]xfade=transition={kieu}:duration={XF:.2f}:offset={moc_t:.3f}[{ra}]")
        cur = ra
    run([FF, "-y", "-loglevel", "error", *vao, "-filter_complex", ";".join(buoc_fc),
         "-map", f"[{cur}]", "-an", "-t", f"{t:.3f}",
         "-c:v", "libx264", "-crf", "20", "-preset", "veryfast", "-pix_fmt", "yuv420p", str(hinh)])
    print(f"  🎬 chuyển cảnh chồng mờ {XF:.2f}s × {len(hinh_parts) - 1} cú")
else:
    lst = tmp / "list.txt"
    lst.write_text("".join(f"file '{q.resolve()}'\n" for q in hinh_parts))
    run([FF, "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", str(lst),
         "-c", "copy", str(hinh)])

noi = tmp / "noi.mp4"
run([FF, "-y", "-loglevel", "error", "-i", str(hinh), "-i", str(tieng),
     "-map", "0:v", "-map", "1:a", "-t", f"{t:.3f}",
     "-c:v", "copy", "-c:a", "aac", "-ar", "24000", str(noi)])

# 3) Phụ đề ASS — chữ ĐEN in hoa trên đầu khung (kiểu Thì Thầm), font đã kiểm chứng đủ dấu
# Chữ Khmer → ép font Khmer, phòng chạy tay/đường gọi nào đó không truyền FONT_CHU (bẫy b6 11/08)
if any(any("\u1780" <= ch <= "\u17ff" for ch in (t or "")) for _, _, t in moc):
    if "khmer" not in FONT_CHU.lower():
        FONT_CHU = "Noto Sans Khmer"
    if "khmer" not in FONT_BRAND.lower():
        FONT_BRAND = FONT_CHU
ass = tmp / "chu.ass"
header = """[Script Info]
PlayResX: 1080
PlayResY: 1920
WrapStyle: 2

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Chu,{FONT_CHU},64,{CHU},{CHO},&H00000000,&H00000000,1,0,1,3,0,8,60,60,150,1
Style: Brand,{FONT_BRAND},44,{CHU},{CHU},&H00000000,&H00000000,0,1,1,2,0,2,60,60,90,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
""".replace("{CHU}", CHU_ASS).replace("{CHO}", CHO_ASS).replace("{FONT_CHU}", FONT_CHU).replace("{FONT_BRAND}", FONT_BRAND)
dong = []
for a, b, txt in moc:
    txt = txt.strip()
    if not txt:
        continue
    # Câu dài → chia nhiều khối, mỗi khối hiện đủ lâu để đọc (không mất chữ, không nhoáng qua)
    for bd, kt, k in chia_khoi_theo_gio(txt.upper(), b - a):
        noi_dung = karaoke(k, kt - bd) if KARAOKE else k
        dong.append(f"Dialogue: 0,{ts(a + bd)},{ts(a + kt)},Chu,,0,0,0,,{noi_dung}")
if BRAND:
    dong.append(f"Dialogue: 0,{ts(0)},{ts(t)},Brand,,0,0,0,,{BRAND}")
ass.write_text(header + "\n".join(dong) + "\n")

# 4) Burn chữ + trộn nhạc + chuẩn hoá tiếng (loudnorm theo video-studio/philosophy/render.md)
final = job / "final.mp4"
vf = f"subtitles=filename='{ass}'"
if VOICE_FILE:
    # Audio người dùng làm track tiếng chính, nhạc nền (nếu có) trộn dưới
    if nhac and nhac.exists():
        print(f"▶ Voice: audio người dùng + nhạc nền {nhac.name} (vol {NHAC_VOL})")
        run([FF, "-y", "-loglevel", "error", "-i", str(noi), "-i", VOICE_FILE,
             "-stream_loop", "-1", "-i", str(nhac),
             "-filter_complex",
             f"[0:v]{vf}[v];[1:a]apad[gio];[2:a]volume={NHAC_VOL},afade=t=out:st={max(t-1.8,0):.2f}:d=1.8[nh];"
             f"[gio][nh]amix=inputs=2:duration=first:dropout_transition=0,loudnorm=I=-14:TP=-3.0:LRA=11[a]",
             "-map", "[v]", "-map", "[a]", "-t", f"{t:.3f}",
             "-c:v", "libx264", "-crf", "20", "-preset", "slow", "-c:a", "aac", "-b:a", "192k",
             "-movflags", "+faststart", str(final)])
    else:
        print("▶ Voice: audio người dùng (không nhạc)")
        run([FF, "-y", "-loglevel", "error", "-i", str(noi), "-i", VOICE_FILE,
             "-filter_complex", f"[0:v]{vf}[v];[1:a]apad,loudnorm=I=-14:TP=-3.0:LRA=11[a]",
             "-map", "[v]", "-map", "[a]", "-t", f"{t:.3f}",
             "-c:v", "libx264", "-crf", "20", "-preset", "slow", "-c:a", "aac", "-b:a", "192k",
             "-movflags", "+faststart", str(final)])
elif nhac and nhac.exists():
    print(f"▶ Nhạc nền: {nhac.name} (vol {NHAC_VOL})")
    run([FF, "-y", "-loglevel", "error", "-i", str(noi), "-stream_loop", "-1", "-i", str(nhac),
         "-filter_complex",
         f"[0:v]{vf}[v];[1:a]volume={NHAC_VOL},afade=t=out:st={max(t-1.8,0):.2f}:d=1.8[nh];"
         f"[0:a][nh]amix=inputs=2:duration=first:dropout_transition=0,loudnorm=I=-14:TP=-3.0:LRA=11[a]",
         "-map", "[v]", "-map", "[a]", "-t", f"{t:.3f}",
         "-c:v", "libx264", "-crf", "20", "-preset", "slow", "-c:a", "aac", "-b:a", "192k",
         "-movflags", "+faststart", str(final)])
else:
    print("⚠️ Chưa có nhạc trong assets/nhac/ — xuất không nhạc")
    run([FF, "-y", "-loglevel", "error", "-i", str(noi),
         "-vf", vf, "-af", "loudnorm=I=-14:TP=-3.0:LRA=11",
         "-c:v", "libx264", "-crf", "20", "-preset", "slow", "-c:a", "aac", "-b:a", "192k",
         "-movflags", "+faststart", str(final)])

print(f"✅ XONG: {final}  ({t:.1f}s, {so_canh} cảnh)")

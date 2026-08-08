#!/usr/bin/env python3
"""B2c: CHUẨN HOÁ ĐỘ DÀI CẢNH bằng code — 0đ, không gọi AI.
Vì sao: AI đếm giây rất tệ — bảo "chia cảnh 6 giây" thì lúc ra 3s, lúc ra 12s.
Nên B2 cứ để AI viết kịch bản tự nhiên, rồi script này GOM/TÁCH lại cho mỗi cảnh
~MUC_TIEU giây, kiểu "đều tương đối": luôn cắt ở RANH GIỚI CÂU, không cắt giữa câu
(anh Tây chốt 08/08 — cắt giữa câu là dẫm lại lỗi karaoke "chữ chưa chạy hết đã chuyển cảnh").

Chạy: python b2c-chuan-canh.py <job-dir>   (sau B2, TRƯỚC b2b đạo diễn)
- Chế độ giọng AI : ước lượng giây = ký tự / KY_TU_GIAY (đo thật 42 cảnh = 17,97) + PAD đọc.
- Chế độ audio    : dùng mốc bat_dau/ket_thuc THẬT; tách cảnh dài thì chia mốc theo tỷ lệ ký tự.
Idempotent: ghi cờ "chuan_canh": true — worker chạy lại job không chuẩn hoá lần 2.
"""
import json
import os
import pathlib
import re
import sys

KY_TU_GIAY = float(os.environ.get("KY_TU_GIAY", "17.97"))  # đo thật 08/08: 2513 ký tự / 139,9s voice
PAD = float(os.environ.get("PAD_DOC", "0.25"))
MUC_TIEU = float(os.environ.get("CANH_GIAY", "6.0"))       # anh Tây chốt 08/08: ~6 giây/cảnh (8s xem thử thấy nhàm)
TOI_THIEU = float(os.environ.get("CANH_MIN", "4.5"))
TOI_DA = float(os.environ.get("CANH_MAX", "7.5"))          # trần cảnh; luôn < MAX_CANH*1.15 (10,35) để không tốn ảnh phụ

job = pathlib.Path(sys.argv[1]).expanduser()
pa = job / "phan-tich.json"
data = json.loads(pa.read_text())
canh = data.get("canh", [])
if not canh:
    sys.exit("❌ Không có cảnh nào")
if data.get("chuan_canh"):
    print("⏭ Đã chuẩn hoá cảnh rồi — bỏ qua")
    sys.exit(0)
che_do_audio = any("bat_dau" in c for c in canh)


def uoc_giay(text):
    """Giây đọc ước lượng của 1 đoạn lời (chế độ giọng AI)."""
    return len(text) / KY_TU_GIAY + PAD


def tach_cau(text):
    """Bẻ đoạn lời thành các CÂU, giữ nguyên dấu chấm câu."""
    phan = re.split(r"(?<=[.!?…])\s+", text.strip())
    return [p.strip() for p in phan if p.strip()]


def tach_don_vi(text):
    """Bẻ lời thành ĐƠN VỊ gom cảnh: mỗi đơn vị kèm cờ "kết câu" (True = kết thúc bằng .!?…).
    Câu ngắn = 1 đơn vị. Câu DÀI (đọc > ~4s) bẻ thêm ở dấu phẩy/chấm phẩy — vì kịch bản kiểu
    truyền cảm hứng toàn câu 5-7 giây, hai câu ghép là vượt trần → không bẻ phẩy thì không bao giờ
    đạt ~8s/cảnh (đo thật 08/08: bộ chỉ-cắt-hết-câu cho ra toàn cảnh 5,5s)."""
    don_vi = []
    for cau in tach_cau(text):
        if uoc_giay(cau) <= 4.0:
            don_vi.append((cau, True))
            continue
        manh = [m.strip() for m in re.split(r"(?<=[,;])\s+", cau) if m.strip()]
        for j, m in enumerate(manh):
            don_vi.append((m, j == len(manh) - 1))
    return don_vi


def gop_don_vi(don_vi):
    """Gom đơn vị thành các nhóm ~MUC_TIEU giây, ƯU TIÊN đóng nhóm ở chỗ KẾT CÂU:
    - đủ (MUC_TIEU - 1) giây và vừa kết câu -> đóng nhóm (cắt đẹp)
    - chạm TOI_DA mà chưa kết câu     -> đành đóng ở dấu phẩy (hoạ hoằn, chỉ với câu siêu dài)
    """
    nhom, hien = [], []
    for text, ket_cau in don_vi:
        # Kiểm tra TRƯỚC khi thêm: thêm vào mà vượt trần thì chốt nhóm hiện tại trước
        if hien and uoc_giay(" ".join(hien + [text])) > TOI_DA:
            nhom.append(" ".join(hien))
            hien = []
        hien.append(text)
        if uoc_giay(" ".join(hien)) >= MUC_TIEU - 1 and ket_cau:
            nhom.append(" ".join(hien))
            hien = []
    if hien:
        nhom.append(" ".join(hien))
    # Nhóm cuối lẻ loi quá ngắn → dồn vào nhóm trước (nếu không phình quá TOI_DA nhiều)
    if len(nhom) >= 2 and uoc_giay(nhom[-1]) < TOI_THIEU * 0.6 \
            and uoc_giay(nhom[-2] + " " + nhom[-1]) <= TOI_DA + 0.8:
        nhom[-2:] = [nhom[-2] + " " + nhom[-1]]
    return nhom


def canh_goc_cua(vi_tri_ky_tu, moc_goc):
    """Tìm cảnh gốc chứa vị trí ký tự này — để mượn prompt ảnh/bối cảnh của nó."""
    for bat_dau, ket_thuc, c in moc_goc:
        if bat_dau <= vi_tri_ky_tu < ket_thuc:
            return c
    return moc_goc[-1][2]


truoc = [round((float(c["ket_thuc"]) - float(c["bat_dau"])), 1) if che_do_audio
         else round(uoc_giay(c.get("loi_thoai") or ""), 1) for c in canh]

if not che_do_audio:
    # ── Chế độ giọng AI: gộp toàn bộ lời thành 1 dòng chảy câu, rồi gom lại từ đầu ──
    moc_goc, vt = [], 0
    for c in canh:
        loi = (c.get("loi_thoai") or "").strip()
        moc_goc.append((vt, vt + len(loi) + 1, c))
        vt += len(loi) + 1
    tat_ca = []
    for c in canh:
        tat_ca.extend(tach_don_vi(c.get("loi_thoai") or ""))
    nhom = gop_don_vi(tat_ca)

    moi, vt = [], 0
    for i, loi in enumerate(nhom, 1):
        goc = canh_goc_cua(vt + len(loi) // 2, moc_goc)   # cảnh gốc ở giữa đoạn lời
        c = dict(goc)
        c["so_thu_tu"] = i
        c["loi_thoai"] = loi
        moi.append(c)
        vt += len(loi) + 1
else:
    # ── Chế độ audio: mốc thời gian là THẬT — chỉ gộp cảnh kề nhau, tách cảnh quá dài ──
    # 1) Tách cảnh dài hơn TOI_DA: chia câu, mốc thời gian chia theo tỷ lệ ký tự (xấp xỉ)
    tach = []
    for c in canh:
        bd, kt = float(c["bat_dau"]), float(c["ket_thuc"])
        d = kt - bd
        loi = (c.get("loi_thoai") or "").strip()
        cac_cau = [t for t, _ in tach_don_vi(loi)]
        if d <= TOI_DA or len(cac_cau) < 2:
            tach.append(dict(c))
            continue
        so_phan = min(max(round(d / MUC_TIEU), 2), len(cac_cau))
        # gom câu thành so_phan phần dài gần bằng nhau theo ký tự
        tong = sum(len(x) for x in cac_cau)
        phan, hien, dem = [], [], 0
        for cau in cac_cau:
            hien.append(cau); dem += len(cau)
            if dem >= tong / so_phan * (len(phan) + 1) and len(phan) < so_phan - 1:
                phan.append(" ".join(hien)); hien = []
        if hien:
            phan.append(" ".join(hien))
        t0 = bd
        for j, p_loi in enumerate(phan):
            ti_le = len(p_loi) / max(sum(len(x) for x in phan), 1)
            t1 = kt if j == len(phan) - 1 else round(t0 + d * ti_le, 2)
            c2 = dict(c); c2["loi_thoai"] = p_loi; c2["bat_dau"] = t0; c2["ket_thuc"] = t1
            tach.append(c2); t0 = t1
    # 2) Gộp cảnh kề nhau còn ngắn
    moi = []
    for c in tach:
        d_c = float(c["ket_thuc"]) - float(c["bat_dau"])
        if moi:
            d_truoc = float(moi[-1]["ket_thuc"]) - float(moi[-1]["bat_dau"])
            if (d_truoc < TOI_THIEU or d_c < TOI_THIEU) and d_truoc + d_c <= TOI_DA:
                moi[-1]["loi_thoai"] = (moi[-1].get("loi_thoai") or "").strip() + " " + (c.get("loi_thoai") or "").strip()
                moi[-1]["ket_thuc"] = c["ket_thuc"]
                continue
        moi.append(dict(c))
    for i, c in enumerate(moi, 1):
        c["so_thu_tu"] = i

sau = [round((float(c["ket_thuc"]) - float(c["bat_dau"])), 1) if che_do_audio
       else round(uoc_giay(c.get("loi_thoai") or ""), 1) for c in moi]

data["canh"] = moi
data["chuan_canh"] = True
data.pop("dao_dien", None)   # cảnh đổi rồi → b2b phải đạo diễn lại theo cảnh mới
pa.write_text(json.dumps(data, ensure_ascii=False, indent=2))
print(f"✅ Chuẩn hoá cảnh ({'audio' if che_do_audio else 'giọng AI'}): "
      f"{len(canh)} cảnh {truoc} → {len(moi)} cảnh {sau} (mục tiêu ~{MUC_TIEU:g}s)")

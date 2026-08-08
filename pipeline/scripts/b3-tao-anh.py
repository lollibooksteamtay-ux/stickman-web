#!/usr/bin/env python3
"""B3: đọc phan-tich.json -> tạo ảnh nhân vật gốc + ảnh từng cảnh (Nano Banana).
Chạy: uv run --python 3.12 --with google-genai python scripts/b3-tao-anh.py jobs/<ten-job>
Quy trình chuẩn của GEM: tạo ẢNH GỐC nhân vật trước, rồi mỗi cảnh = ảnh gốc + prompt_kem_anh_goc.
"""
import json
import os
import pathlib
import sys
import time

ROOT = pathlib.Path(__file__).resolve().parent.parent


def load_env():
    envf = ROOT / ".env"
    if envf.exists():
        for line in envf.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip())


load_env()
KEY = os.environ.get("GEMINI_API_KEY")
if not KEY:
    sys.exit("❌ Thiếu GEMINI_API_KEY trong .env")
MODEL = os.environ.get("MODEL_ANH", "gemini-2.5-flash-image")

job = pathlib.Path(sys.argv[1]).expanduser()
pa = job / "phan-tich.json"
if not pa.exists():
    sys.exit(f"❌ Chưa có {pa} — chạy B2 trước")
data = json.loads(pa.read_text())
anh_dir = job / "anh"
anh_dir.mkdir(exist_ok=True)

from google import genai  # noqa: E402
from google.genai import types  # noqa: E402

client = genai.Client(api_key=KEY)

# Ép phong cách ở tầng vẽ — bất kể prompt kịch bản viết gì (chống lẫn màu / ảnh thật)
NEN = os.environ.get("NEN_MAU", "solid black background")
NET = os.environ.get("NET_MAU", "hand-drawn chalk-like white line art")
RANG_BUOC = (
    f" MANDATORY STYLE (overrides everything above): strictly black and white monochrome, "
    f"{NET} on {NEN}, slightly wobbly organic hand-drawn strokes like white chalk (NOT uniform "
    f"machine-perfect lines), no colors whatsoever, no photographic or photorealistic elements, "
    f"no 3D, 100% flat hand-drawn line art. Match the drawing style of the reference images exactly "
    f"(style only — do NOT copy their content)."
    f" ABSOLUTELY NO TEXT: no letters, no words, no numbers, no captions, no signs, no logos "
    f"anywhere in the image."
    f" MANDATORY COMPOSITION: keep the TOP 25% of the image completely EMPTY — pure solid black, "
    f"no drawings, no objects, no tree branches, nothing in that zone (it is reserved for text overlay). "
    f"Place the entire scene in the middle and lower 75% of the frame."
)

# ĐOÀN NHÂN VẬT CỐ ĐỊNH (anh Tây tự vẽ, nạp qua Quản trị) — vừa là nhân vật, vừa là mỏ neo phong cách
DAN_DIR = ROOT / "assets" / "nhan-vat"
dan = {}
for f in sorted(DAN_DIR.glob("*.png")):
    try:
        dan[f.stem] = types.Part.from_bytes(data=f.read_bytes(), mime_type="image/png")
    except Exception:
        pass
NV_CHINH = next((t for t in ("nam-chinh", "nam-trung-nien") if t in dan), (sorted(dan)[0] if dan else None))

# Chỉ khi CHƯA có đoàn nhân vật mới quay lại dùng ảnh mẫu tay vẽ cũ
mau_parts = []
if not dan:
    for f in sorted((ROOT / "assets" / "mau-chuan").glob("*.png"))[:2]:
        try:
            mau_parts.append(types.Part.from_bytes(data=f.read_bytes(), mime_type="image/png"))
        except Exception:
            pass
    print(f"▶ Chưa có đoàn nhân vật — dùng {len(mau_parts)} ảnh mẫu tay vẽ")
else:
    print(f"▶ Đoàn nhân vật cố định: {sorted(dan)} · nhân vật chính: {NV_CHINH}")


QC_ANH = os.environ.get("QC_ANH", "1") == "1"
MODEL_QC = os.environ.get("MODEL_QC", "gemini-3.1-flash-lite")


def _ve_tho(contents, out_path, nhan):
    """Vẽ 1 ảnh (retry lỗi API 3 lần). Trả True nếu có file."""
    for attempt in range(3):
        try:
            resp = client.models.generate_content(
                model=MODEL,
                contents=contents,
                config=types.GenerateContentConfig(response_modalities=["TEXT", "IMAGE"]),
            )
            for part in resp.candidates[0].content.parts:
                if getattr(part, "inline_data", None) and part.inline_data.data:
                    out_path.write_bytes(part.inline_data.data)
                    return True
            print(f"  ⚠️ {nhan}: không có ảnh trong phản hồi (lần {attempt+1})")
        except Exception as e:  # rate limit / lỗi tạm
            print(f"  ⚠️ {nhan}: {e} — thử lại sau 20s")
            time.sleep(20)
    return False


def qc_may(path):
    """Lớp QC 1 — máy đo pixel, 0đ: ảnh đen / trống / dính màu."""
    try:
        from PIL import Image
        im = Image.open(path).convert("RGB").resize((135, 240))
        px = list(im.getdata())
        sang = [max(p) for p in px]
        if max(sang) < 60:
            return False, "the image is almost completely black/empty"
        if sum(1 for v in sang if v > 90) < len(px) * 0.005:
            return False, "the drawing is too sparse, almost nothing visible"
        mau = sum(1 for p in px if max(p) - min(p) > 45 and max(p) > 70)
        if mau > len(px) * 0.01:
            return False, "the image contains COLORS — it must be strictly black and white"
    except Exception:
        pass  # QC hỏng không chặn vẽ
    return True, ""


def qc_ai(path, mo_ta):
    """Lớp QC 2 — AI rẻ nhìn ảnh: có khớp mô tả không, có dính chữ không (~20đ/ảnh)."""
    try:
        anh_part = types.Part.from_bytes(data=pathlib.Path(path).read_bytes(), mime_type="image/png")
        hoi = (
            "Kiểm tra bức tranh người que trắng-đen này. Mô tả yêu cầu: "
            f"\"{str(mo_ta)[:500]}\".\n"
            "Trả JSON thuần: {\"khop\": true/false, \"co_chu\": true/false, \"ly_do\": \"...\"}.\n"
            "- khop=false CHỈ KHI hình hoàn toàn lạc đề hoặc trống trơn vô nghĩa "
            "(ẩn dụ/cách điệu vẫn tính là khớp — đừng khó tính).\n"
            "- co_chu=true nếu trong tranh có chữ cái/con số/từ ngữ bất kỳ."
        )
        resp = client.models.generate_content(
            model=MODEL_QC, contents=[anh_part, hoi],
            config=types.GenerateContentConfig(temperature=0),
        )
        t = resp.text.strip()
        if t.startswith("```"):
            t = t.split("```")[1]
            if t.startswith("json"):
                t = t[4:]
        kq = json.loads(t.strip())
        if kq.get("co_chu"):
            return False, "the image contains TEXT/letters — absolutely no text allowed"
        if not kq.get("khop", True):
            return False, f"the image does not depict the scene: {str(kq.get('ly_do', ''))[:150]}"
    except Exception:
        pass  # QC AI trục trặc thì cho qua, không chặn job
    return True, ""


def sinh_anh(contents, out_path, nhan, mo_ta=""):
    """Vẽ + QC 2 lớp + tự vẽ lại 1 lần kèm lời chê nếu rớt."""
    if not _ve_tho(contents, out_path, nhan):
        return False
    if not QC_ANH:
        print(f"  ✅ {nhan}: {out_path.name}")
        return True
    ok, loi_qc = qc_may(out_path)
    if ok:
        ok, loi_qc = qc_ai(out_path, mo_ta or contents[-1])
    if ok:
        print(f"  ✅ {nhan}: {out_path.name} (QC đạt)")
        return True
    # Rớt QC → vẽ lại đúng 1 lần, nói rõ lỗi cho model sửa
    print(f"  🔁 {nhan}: rớt QC ({loi_qc[:80]}) — vẽ lại")
    lai = contents[:-1] + [str(contents[-1]) + f" PREVIOUS ATTEMPT WAS REJECTED because: {loi_qc}. Fix this."]
    if _ve_tho(lai, out_path, nhan):
        ok2, _ = qc_may(out_path)
        print(f"  ✅ {nhan}: {out_path.name} ({'QC đạt sau vẽ lại' if ok2 else 'vẫn chưa hoàn hảo — dùng bản tốt nhất'})")
        return True
    return out_path.exists()


# 1) Nhân vật tham chiếu: có đoàn cố định thì dùng luôn (0đ), không thì vẽ nhân vật gốc như cũ
goc = anh_dir / "nhanvat-goc.png"
if dan:
    print("▶ Dùng đoàn nhân vật cố định — KHÔNG vẽ nhân vật gốc (tiết kiệm 1 ảnh/video)")
    goc_part = None
elif goc.exists():
    print(f"▶ Dùng ảnh nhân vật có sẵn: {goc.name}")
    goc_part = types.Part.from_bytes(data=goc.read_bytes(), mime_type="image/png")
else:
    print("▶ Tạo ảnh gốc nhân vật...")
    prompt_goc = json.dumps(data["prompt_nhan_vat_goc"], ensure_ascii=False) + RANG_BUOC
    if not sinh_anh(mau_parts + [prompt_goc], goc, "nhân vật gốc", mo_ta=str(data["prompt_nhan_vat_goc"])):
        sys.exit("❌ Không tạo được ảnh nhân vật gốc")
    goc_part = types.Part.from_bytes(data=goc.read_bytes(), mime_type="image/png")

MAX_CANH = float(os.environ.get("MAX_CANH", "9.0"))   # cảnh dài hơn mức này cần VẼ THÊM ảnh
CHU_MOI_GIAY = 17.97   # đo thật 08/08: 2513 ký tự / 139,9s voice (42 cảnh)                                   # tốc độ đọc tiếng Việt ~14-15 ký tự/giây

# Ảnh phụ cho cảnh dài: mô tả "khoảnh khắc kế tiếp" để hình đổi thật, không phải zoom lại ảnh cũ
GOC_MAY = [
    " NEXT MOMENT of the same scene: same character and same setting, but a clearly different"
    " pose/action and a closer camera framing (medium close-up). Keep continuity.",
    " LATER MOMENT of the same scene: same character and setting, wider camera framing,"
    " different body pose and slightly different arrangement of props. Keep continuity.",
    " FINAL MOMENT of the same scene: same character and setting, different angle and pose,"
    " showing the outcome of the action. Keep continuity.",
]


def do_dai_canh(c):
    """Thời lượng cảnh: chế độ audio có mốc sẵn; chế độ giọng AI thì ước từ độ dài chữ."""
    if "bat_dau" in c and "ket_thuc" in c:
        try:
            return float(c["ket_thuc"]) - float(c["bat_dau"])
        except (TypeError, ValueError):
            pass
    return len((c.get("loi_thoai") or "")) / CHU_MOI_GIAY


# 2) Ảnh từng cảnh — ảnh gốc + prompt_kem_anh_goc. Cảnh dài được vẽ THÊM ảnh phụ.
loi = []
tong_anh = 0
for c in data["canh"]:
    i = c["so_thu_tu"]
    prompt_goc_canh = json.dumps(c["prompt_kem_anh_goc"], ensure_ascii=False)
    d = do_dai_canh(c)
    so_anh = 1 if d <= MAX_CANH * 1.15 else min(int(-(-d // MAX_CANH)), 1 + len(GOC_MAY))

    for k in range(so_anh):
        ten = f"canh-{i:02d}.png" if k == 0 else f"canh-{i:02d}-{chr(ord('b') + k - 1)}.png"
        out = anh_dir / ten
        tong_anh += 1
        if out.exists():
            print(f"  ⏭ {ten} đã có, bỏ qua")
            continue
        prompt = prompt_goc_canh + (GOC_MAY[k - 1] if k else "") + RANG_BUOC
        # Ảnh tham chiếu: nhân vật đạo diễn chỉ định cho cảnh này (tối đa 2 để AI không bị rối)
        if dan:
            ten_nv = [t for t in (c.get("nhan_vat") or []) if t in dan][:2] or ([NV_CHINH] if NV_CHINH else [])
            refs = [dan[t] for t in ten_nv]
            prompt += (f" Use the attached character reference image(s) as the EXACT character design and drawing "
                       f"style for the character(s) in this scene ({', '.join(ten_nv)}); keep the same head shape, "
                       f"same thin double-line chalk strokes, same proportions. Do not copy the reference pose.")
        else:
            ten_nv = []
            refs = mau_parts + ([goc_part] if goc_part else [])
        nhan = (f"cảnh {i}" if k == 0 else f"cảnh {i} (ảnh phụ {k} — cảnh dài {d:.1f}s)") + \
               (f" [{'+'.join(ten_nv)}]" if ten_nv else "")
        mo_ta_qc = f"{c.get('loi_thoai', '')} — {str(c['prompt_kem_anh_goc'])[:300]}"
        if not sinh_anh(refs + [prompt], out, nhan, mo_ta=mo_ta_qc):
            loi.append(ten)
        time.sleep(2)  # tránh rate limit

if loi:
    print(f"⚠️ Ảnh lỗi (chạy lại lệnh này để bù): {loi}")
    sys.exit(1)
print(f"✅ Đủ {tong_anh} ảnh cho {len(data['canh'])} cảnh trong {anh_dir}")

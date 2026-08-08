#!/usr/bin/env python3
"""Vẽ ĐOÀN NHÂN VẬT CỐ ĐỊNH — chạy 1 lần, dùng cho mọi video về sau.
Chạy: python ve-nhan-vat.py [ten-nhan-vat ...]   (bỏ trống = vẽ tất cả còn thiếu)
Ra: pipeline/assets/nhan-vat/<ten>.png

Phong cách bám đúng 3 ảnh mẫu chuẩn (crop từ video tay của Hoàng) trong assets/mau-chuan/.
Nhân vật vẽ ở dáng trung tính, toàn thân, giữa khung — để dùng làm ảnh tham chiếu khi vẽ cảnh.
"""
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
    sys.exit("❌ Thiếu GEMINI_API_KEY")
MODEL = os.environ.get("MODEL_ANH", "gemini-2.5-flash-image")

# Bộ nhân vật chốt theo dữ liệu 14 kịch bản / 131 cảnh đã làm (không vẽ trẻ con: 0/131 cảnh)
DAN = {
    "nam-trung-nien": (
        "A single full-body stick figure character: adult man, COMPLETELY BALD round head with NO HAIR AT ALL "
        "(smooth empty round head outline), minimal dot eyes and a small calm smile, wearing a simple collared "
        "shirt with a visible collar line, slim limbs, standing upright in a neutral relaxed pose facing the viewer."
    ),
    "nguoi-thu-hai": (
        "A single full-body stick figure character: adult man, clearly SHORTER and slightly stockier, COMPLETELY BALD "
        "round head with NO HAIR AT ALL, dot eyes and a neutral straight mouth, wearing a plain simple shirt WITHOUT "
        "a collar, standing upright in a neutral pose facing the viewer. Must look like a clearly different person."
    ),
    "nguoi-gia": (
        "A single full-body stick figure character: elderly person, back slightly hunched forward, simple round head "
        "COMPLETELY BALD with NO HAIR, dot eyes, a few short beard strokes on the chin, holding a thin walking cane in one hand, wearing a "
        "long simple robe-like shirt, standing in a neutral calm pose facing the viewer."
    ),
    "nu-truong-thanh": (
        "A single full-body stick figure character: adult woman, simple round head with dot eyes and a small calm "
        "smile, shoulder-length hair drawn with a few simple strokes, wearing a simple knee-length dress, slim limbs, "
        "standing upright in a neutral relaxed pose facing the viewer."
    ),
}

NEN = os.environ.get("NEN_MAU", "solid black background")
NET = os.environ.get("NET_MAU", "hand-drawn chalk-like white line art")
LUAT = (
    f" MANDATORY STYLE: strictly black and white monochrome, {NET} on {NEN}, slightly wobbly organic hand-drawn "
    f"strokes like white chalk (NOT uniform machine-perfect lines), no colors whatsoever, no photographic or "
    f"photorealistic elements, no 3D, 100% flat hand-drawn line art. Match the drawing style of the reference "
    f"images exactly (style only — do NOT copy their content or composition)."
    f" ABSOLUTELY NO TEXT: no letters, no words, no numbers, no logos anywhere."
    f" COMPOSITION: ONE single character only, full body from head to feet, centered, plain empty black background, "
    f"no props, no scenery, no other people. Vertical 9:16 frame. This is a CHARACTER REFERENCE SHEET."
)

from google import genai  # noqa: E402
from google.genai import types  # noqa: E402

client = genai.Client(api_key=KEY)

out_dir = ROOT / "assets" / "nhan-vat"
out_dir.mkdir(parents=True, exist_ok=True)

# Ảnh mẫu chuẩn (tay vẽ) làm mỏ neo phong cách — đính tối đa 2 để AI không bị rối
mau = []
for f in sorted((ROOT / "assets" / "mau-chuan").glob("*.png"))[:2]:
    mau.append(types.Part.from_bytes(data=f.read_bytes(), mime_type="image/png"))
print(f"▶ Mỏ neo phong cách: {len(mau)} ảnh mẫu tay vẽ")

can_ve = sys.argv[1:] or list(DAN)
for ten in can_ve:
    if ten not in DAN:
        print(f"  ⚠️ không biết nhân vật '{ten}' — bỏ qua")
        continue
    out = out_dir / f"{ten}.png"
    if out.exists():
        print(f"  ⏭ {ten} đã có, bỏ qua (xoá file nếu muốn vẽ lại)")
        continue
    xong = False
    for lan in range(3):
        try:
            resp = client.models.generate_content(
                model=MODEL,
                contents=mau + [DAN[ten] + LUAT],
                config=types.GenerateContentConfig(response_modalities=["TEXT", "IMAGE"]),
            )
            for part in resp.candidates[0].content.parts:
                if getattr(part, "inline_data", None) and part.inline_data.data:
                    out.write_bytes(part.inline_data.data)
                    print(f"  ✅ {ten}: {out.name} ({len(part.inline_data.data)//1024} KB)")
                    xong = True
                    break
            if xong:
                break
            print(f"  ⚠️ {ten}: không có ảnh trong phản hồi (lần {lan+1})")
        except Exception as e:
            print(f"  ⚠️ {ten}: {str(e)[-120:]} — thử lại sau 15s")
            time.sleep(15)
    if not xong:
        print(f"  ❌ {ten}: vẽ thất bại")
    time.sleep(2)

print(f"\n✅ Đoàn nhân vật hiện có: {sorted(p.stem for p in out_dir.glob('*.png'))}")

#!/usr/bin/env python3
"""B2: video -> kịch bản + prompt ảnh từng cảnh (JSON), nhái format GEM.
Chạy: uv run --python 3.12 --with google-genai python scripts/b2-phan-tich.py <video> [file-json-ra]
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
    sys.exit("❌ Thiếu GEMINI_API_KEY — điền vào file .env (xem .env.mau)")

MODEL = os.environ.get("MODEL_PHAN_TICH", "gemini-2.5-flash")

video = pathlib.Path(sys.argv[1]).expanduser()
if not video.exists():
    sys.exit(f"❌ Không thấy video: {video}")
out = pathlib.Path(sys.argv[2]) if len(sys.argv) > 2 else ROOT / "jobs" / video.stem / "phan-tich.json"
out.parent.mkdir(parents=True, exist_ok=True)

from google import genai  # noqa: E402

client = genai.Client(api_key=KEY)

print(f"▶ Upload {video.name} lên Gemini...")
f = client.files.upload(file=video)
while f.state.name == "PROCESSING":
    time.sleep(3)
    f = client.files.get(name=f.name)
if f.state.name != "ACTIVE":
    sys.exit(f"❌ Upload lỗi, state = {f.state.name}")

master = (ROOT / "prompts" / "master-prompt.txt").read_text()

# Ghi đè màu theo .env — video mẫu màu gì kệ nó, video CỦA MÌNH dùng màu mình chọn
nen = os.environ.get("NEN_MAU", "solid black background")
net = os.environ.get("NET_MAU", "clean white line art")
master += f"""

GHI ĐÈ MÀU SẮC + PHONG CÁCH (ưu tiên cao nhất, bất kể màu của video mẫu):
- Mọi "background_and_setting" phải dùng: "{nen}"
- Mọi mô tả nét vẽ nhân vật/vật thể phải dùng: "{net}" (thay vì black line art)
- "Style" đổi thành: "2D minimalist stick figure line art, {net} on {nen}, strictly monochrome black and white"
- TUYỆT ĐỐI KHÔNG MÀU: mọi prompt ảnh phải kèm "strictly black and white monochrome, no colors whatsoever, no photorealistic elements, 100% hand-drawn flat line art only". CẤM mô tả bất kỳ vật thể nào có màu (đỏ, vàng, xanh...), CẤM nền ảnh chụp thật, CẤM 3D render.
- BỐ CỤC: mọi prompt ảnh phải yêu cầu "keep the top 25% of the frame completely empty (solid black), place the scene in the middle and lower area" — phần trên cùng dành cho phụ đề, không được vẽ gì vào đó.

ĐỘ DÀI CẢNH (rất quan trọng — ảnh hưởng chi phí):
- Mỗi cảnh khoảng **6 giây lời thoại** (~100-120 ký tự). GỘP các câu ngắn liền ý vào CÙNG 1 cảnh.
  ĐỪNG tách mỗi câu thành 1 cảnh — mỗi cảnh tốn 1 hình vẽ.
- Chỉ mở cảnh mới khi Ý ĐỔI HẲN. Số cảnh tuỳ độ dài video, KHÔNG cố định.

THÊM TRƯỜNG TIÊU ĐỀ (bắt buộc):
JSON trả về phải có thêm trường "tieu_de" ở cấp cao nhất: tiêu đề tiếng Việt 4-8 từ tóm đúng
nội dung chính của kịch bản (ví dụ "Thất bại là bóng mát ngày mai"). Không dùng dấu ngoặc kép bên trong.
"""

print(f"▶ Phân tích bằng {MODEL} (video dài thì chờ ~1-2 phút)...")
print(f"   Màu: nền [{nen}] · nét [{net}]")
resp = client.models.generate_content(model=MODEL, contents=[f, master])
text = resp.text.strip()

# Gỡ code fence nếu model lỡ bọc
if text.startswith("```"):
    text = text.split("```")[1]
    if text.startswith("json"):
        text = text[4:]
    text = text.strip()

try:
    data = json.loads(text)
except json.JSONDecodeError as e:
    raw = out.with_suffix(".raw.txt")
    raw.write_text(text)
    sys.exit(f"❌ JSON hỏng ({e}). Đã lưu bản thô: {raw}")

out.write_text(json.dumps(data, ensure_ascii=False, indent=2))
print(f"✅ {out}")
print(f"   Kịch bản: {len(data.get('kich_ban', []))} dòng · Cảnh: {len(data.get('canh', []))}")

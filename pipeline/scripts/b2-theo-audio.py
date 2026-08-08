#!/usr/bin/env python3
"""B2 chế độ AUDIO CỦA NGƯỜI DÙNG: video mẫu (học phong cách hình) + file audio (nguồn lời).
Gemini nghe audio → bóc nguyên văn lời + mốc thời gian từng câu → chia cảnh theo audio,
sinh prompt ảnh cho từng cảnh theo phong cách video mẫu.
Chạy: python b2-theo-audio.py <video-mau hoặc "-"> <file-audio> <file-json-ra>
Tham số 1 = "-" nghĩa là KHÔNG có video mẫu: hình minh hoạ tự sáng tác theo phong cách chuẩn.
Khác b2 thường: mỗi cảnh có thêm bat_dau/ket_thuc (giây, theo audio) — B5 dùng để khớp hình với tiếng.
"""
import json
import mimetypes
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
MODEL = os.environ.get("MODEL_PHAN_TICH", "gemini-3.6-flash")

co_video = sys.argv[1] != "-"
video = pathlib.Path(sys.argv[1]).expanduser() if co_video else None
audio = pathlib.Path(sys.argv[2]).expanduser()
out = pathlib.Path(sys.argv[3])
if co_video and not video.exists():
    sys.exit(f"❌ Không thấy video mẫu: {video}")
if not audio.exists():
    sys.exit(f"❌ Không thấy audio: {audio}")
out.parent.mkdir(parents=True, exist_ok=True)

from google import genai  # noqa: E402
from google.genai import types  # noqa: E402

client = genai.Client(api_key=KEY)


def upload_cho(f, mime=None):
    print(f"▶ Upload {f.name}...")
    g = client.files.upload(file=f, config={"mime_type": mime} if mime else None)
    while g.state.name == "PROCESSING":
        time.sleep(3)
        g = client.files.get(name=g.name)
    if g.state.name != "ACTIVE":
        sys.exit(f"❌ Upload {f.name} lỗi, state = {g.state.name}")
    return g


fv = upload_cho(video) if co_video else None
mime = mimetypes.guess_type(str(audio))[0] or "audio/mpeg"
fa = upload_cho(audio, mime)

master = (ROOT / "prompts" / "master-prompt.txt").read_text()
nen = os.environ.get("NEN_MAU", "solid black background")
net = os.environ.get("NET_MAU", "clean white line art")

master += f"""

GHI ĐÈ MÀU SẮC + PHONG CÁCH (ưu tiên cao nhất, bất kể màu của video mẫu):
- Mọi "background_and_setting" phải dùng: "{nen}"
- Mọi mô tả nét vẽ nhân vật/vật thể phải dùng: "{net}" (thay vì black line art)
- "Style" đổi thành: "2D minimalist stick figure line art, {net} on {nen}, strictly monochrome black and white"
- TUYỆT ĐỐI KHÔNG MÀU: mọi prompt ảnh phải kèm "strictly black and white monochrome, no colors whatsoever, no photorealistic elements, 100% hand-drawn flat line art only". CẤM nền ảnh chụp thật, CẤM 3D render.
- BỐ CỤC: mọi prompt ảnh phải yêu cầu "keep the top 25% of the frame completely empty (solid black), place the scene in the middle and lower area" — phần trên cùng dành cho phụ đề, không được vẽ gì vào đó.

CHẾ ĐỘ ĐẶC BIỆT — LỜI THOẠI LẤY TỪ FILE AUDIO ĐÍNH KÈM (ưu tiên cao nhất):
Người dùng đã cung cấp file AUDIO chứa giọng đọc của chính họ.
{"Video đính kèm chỉ để học phong cách hình." if co_video else "KHÔNG có video mẫu: tự sáng tác hình minh hoạ cho từng đoạn lời theo đúng phong cách người que tối giản mô tả ở trên."}
1. NGHE file audio, chép NGUYÊN VĂN lời nói — đúng 100% TỪNG TỪ như người tốc ký:
   không viết lại, không thêm bớt, không bỏ từ đệm (thì, là, mà, rằng, cứ, vẫn...),
   không sửa ngữ pháp, không rút gọn. Chép xong hãy TỰ RÀ LẠI một lượt xem có sót từ nào không.
2. Chia lời thành các cảnh — mỗi cảnh khoảng **6 giây** (GỘP các câu ngắn liền ý vào CÙNG 1 cảnh).
   ĐỪNG tách mỗi câu thành 1 cảnh: mỗi cảnh tốn 1 hình vẽ nên cảnh vụn làm chi phí tăng vọt.
   Chỉ tách cảnh khi Ý ĐỔI HẲN. Cảnh nào dài quá 7 giây mới tách làm 2.
3. "loi_thoai" của mỗi cảnh = nguyên văn đoạn audio tương ứng.
4. Mỗi cảnh THÊM 2 trường: "bat_dau" và "ket_thuc" = mốc thời gian (giây, số thực, ví dụ 12.5)
   của đoạn lời đó TRONG FILE AUDIO. Cảnh đầu bat_dau=0. Các cảnh liền mạch không hở không chồng.
   "ket_thuc" của cảnh cuối = đúng thời điểm kết thúc lời nói trong audio.
5. Nội dung ảnh ("prompt_kem_anh_goc") minh hoạ ý của ĐOẠN LỜI đó, phong cách hình học từ video mẫu.
6. KHÔNG bịa lời từ video mẫu — lời chỉ lấy từ audio.

THÊM TRƯỜNG TIÊU ĐỀ (bắt buộc):
JSON trả về phải có thêm trường "tieu_de" ở cấp cao nhất: tiêu đề tiếng Việt 4-8 từ tóm đúng
nội dung chính của lời trong audio. Không dùng dấu ngoặc kép bên trong.
"""

print(f"▶ Phân tích audio + video mẫu bằng {MODEL}...")
resp = client.models.generate_content(
    model=MODEL,
    contents=([fv, fa, master] if co_video else [fa, master]),
    config=types.GenerateContentConfig(temperature=0),  # chép lời nguyên văn, không sáng tạo
)
text = resp.text.strip()
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

# Kiểm tra mốc thời gian tối thiểu
canh = data.get("canh", [])
if not canh:
    sys.exit("❌ Không có cảnh nào")
for c in canh:
    if "bat_dau" not in c or "ket_thuc" not in c:
        sys.exit(f"❌ Cảnh {c.get('so_thu_tu')} thiếu mốc thời gian bat_dau/ket_thuc")

out.write_text(json.dumps(data, ensure_ascii=False, indent=2))
print(f"✅ {out} — {len(canh)} cảnh theo audio ({canh[-1]['ket_thuc']}s)")

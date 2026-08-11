#!/usr/bin/env python3
"""B2t: DỊCH kịch bản sang tiếng thị trường (hiện chỉ Khmer) — chạy key FREE, 0đ.
Chạy: python b2t-dich.py <job-dir> <ngon-ngu>   (sau B2, TRƯỚC b2c chuẩn hoá cảnh —
vì độ dài cảnh phải tính trên chữ TIẾNG ĐÍCH, giọng đọc đọc tiếng đích).

Luật bắt buộc với bản dịch Khmer (phục vụ khâu sau, không phải màu mè):
- Sau mỗi dấu chấm câu Khmer ។ phải có DẤU CÁCH — bộ chia cảnh cắt câu ở đó.
- Chèn dấu cách giữa các cụm từ (2-4 từ một cụm) — tiếng Khmer viết liền,
  không có dấu cách thì bộ bẻ dòng phụ đề không biết ngắt đâu.
Idempotent: cờ "ngon_ngu" trong phan-tich.json — chạy lại không dịch lần 2.
Giữ bản gốc ở loi_thoai_goc / tieu_de_goc để admin đối chiếu.
"""
import json
import os
import pathlib
import sys

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

job = pathlib.Path(sys.argv[1]).expanduser()
ngon_ngu = sys.argv[2] if len(sys.argv) > 2 else "kh"
if ngon_ngu != "kh":
    sys.exit(f"❌ Chưa hỗ trợ ngôn ngữ: {ngon_ngu}")

pa = job / "phan-tich.json"
data = json.loads(pa.read_text())
if data.get("ngon_ngu") == ngon_ngu:
    print("⏭ Đã dịch rồi — bỏ qua")
    sys.exit(0)
canh = data.get("canh", [])
if not canh:
    sys.exit("❌ Không có cảnh nào")

from google import genai  # noqa: E402
from google.genai import types  # noqa: E402

client = genai.Client(api_key=KEY)

goi = {
    "tieu_de": data.get("tieu_de", ""),
    "canh": [{"so_thu_tu": c["so_thu_tu"], "loi_thoai": c.get("loi_thoai", "")} for c in canh],
}
prompt = f"""Bạn là biên dịch viên bản ngữ Campuchia chuyên làm video ngắn TikTok.
Dịch tiêu đề và lời thoại từng cảnh dưới đây từ tiếng Việt sang TIẾNG KHMER.

YÊU CẦU DỊCH:
1. Dịch theo Ý, văn NÓI tự nhiên như người Campuchia kể chuyện — KHÔNG dịch word-by-word.
2. Giữ giọng điệu truyền cảm hứng, dứt khoát, hợp video ngắn.
3. ĐỊNH DẠNG BẮT BUỘC (máy xử lý phía sau cần):
   - Kết thúc mỗi câu bằng ។ và NGAY SAU ។ phải có một dấu cách.
   - Chèn dấu cách giữa các cụm từ ngắn (2-4 từ một cụm) trong câu.
   - Ngắt hơi giữa câu dùng dấu phẩy "," + dấu cách.
   - Không phiên âm Latin, không chú thích, không emoji.
4. KHÔNG gộp/tách cảnh — trả đúng số cảnh với đúng so_thu_tu.

Trả về DUY NHẤT JSON: {{"tieu_de": "...", "canh": [{{"so_thu_tu": 1, "loi_thoai": "..."}}, ...]}}

DỮ LIỆU:
{json.dumps(goi, ensure_ascii=False)}"""

print(f"▶ Dịch {len(canh)} cảnh sang tiếng Khmer bằng {MODEL}...")
resp = client.models.generate_content(
    model=MODEL, contents=[prompt],
    config=types.GenerateContentConfig(temperature=0.3),
)
text = resp.text.strip()
if text.startswith("```"):
    text = text.split("```")[1]
    if text.startswith("json"):
        text = text[4:]
    text = text.strip()

try:
    ban_dich = json.loads(text)
except json.JSONDecodeError as e:
    (job / "dich.raw.txt").write_text(text)
    sys.exit(f"❌ JSON bản dịch hỏng ({e}) — xem dich.raw.txt")

bang = {int(x["so_thu_tu"]): str(x.get("loi_thoai", "")).strip()
        for x in ban_dich.get("canh", []) if "so_thu_tu" in x}
thieu = [c["so_thu_tu"] for c in canh if not bang.get(int(c["so_thu_tu"]))]
if thieu:
    sys.exit(f"❌ Bản dịch thiếu cảnh: {thieu} — job dừng để không ra video nửa Việt nửa Khmer")

for c in canh:
    c["loi_thoai_goc"] = c.get("loi_thoai", "")
    c["loi_thoai"] = bang[int(c["so_thu_tu"])]
td = str(ban_dich.get("tieu_de", "")).strip()
if td:
    data["tieu_de_goc"] = data.get("tieu_de", "")
    data["tieu_de"] = td
data["ngon_ngu"] = ngon_ngu
pa.write_text(json.dumps(data, ensure_ascii=False, indent=2))
print(f"✅ Đã dịch {len(canh)} cảnh + tiêu đề sang tiếng Khmer")

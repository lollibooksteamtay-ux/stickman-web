#!/usr/bin/env python3
"""B2b: ĐẠO DIỄN HÌNH ẢNH — lượt AI thứ hai chỉ lo nghĩ hình, chạy sau B2 trước B3.
Vấn đề nó giải quyết (so sánh tay vs máy 06/08): B2 viết prompt vẽ vội trong lúc viết kịch bản
→ hình minh hoạ NGHĨA ĐEN, nền trống, không ẩn dụ. Bản tay của Hoàng mỗi câu có 1 phép
ẩn dụ thị giác đắt (người nứt đôi + đồng hồ = thay đổi; thả bóng bay = buông kỳ vọng).

Chạy: python b2b-dao-dien.py <job-dir>
Đọc phan-tich.json → viết lại prompt_nhan_vat_goc + prompt_kem_anh_goc từng cảnh → ghi đè,
đánh dấu "dao_dien": true để chạy lại job không tốn tiền lượt này nữa.
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
pa = job / "phan-tich.json"
data = json.loads(pa.read_text())
if data.get("dao_dien"):
    print("⏭ Đã đạo diễn rồi, bỏ qua")
    sys.exit(0)

from google import genai  # noqa: E402
from google.genai import types  # noqa: E402

client = genai.Client(api_key=KEY)

canh_gon = [{"so_thu_tu": c["so_thu_tu"], "loi_thoai": c.get("loi_thoai", "")} for c in data["canh"]]

# Đoàn nhân vật cố định đang có (anh Tây tự vẽ, nạp qua Quản trị)
dan = sorted(p.stem for p in (ROOT / "assets" / "nhan-vat").glob("*.png"))
mo_ta_dan = ("\n".join(f"- {t}" for t in dan)) if dan else "(chưa có nhân vật cố định)"


prompt = f"""Bạn là ĐẠO DIỄN HÌNH ẢNH cho video người que triết lý (phong cách kênh "Thì Thầm":
nét vẽ tay trắng trên nền đen tuyền, tối giản nhưng GIÀU Ý).

KỊCH BẢN (mỗi cảnh 1 câu):
{json.dumps(canh_gon, ensure_ascii=False, indent=1)}

NHIỆM VỤ: với TỪNG cảnh, thiết kế 1 bức hình theo luật sau:

1. ẨN DỤ THỊ GIÁC, CẤM MINH HOẠ NGHĨA ĐEN. Câu nói về "thay đổi" thì KHÔNG vẽ người đứng
   yên — hãy nghĩ như hoạ sĩ biếm: người nứt làm đôi nửa cười nửa cau có; buông kỳ vọng =
   thả chùm bóng bay; đời gặp gỡ chia ly = con đường uốn khúc có các cặp người gặp rồi tách.
   Mỗi cảnh PHẢI có 1 ý tưởng hình như vậy, người xem TẮT TIẾNG vẫn hiểu câu nói.
2. HÌNH PHẢI "GÁNH" ĐƯỢC 6 GIÂY: mỗi cảnh dài 5-7 giây nên bức hình cần NHIỀU CHI TIẾT
   để mắt còn thứ khám phá — trọng tâm rõ + 2-3 chi tiết phụ đặt ở các vị trí khác nhau
   trong khung (một ở tiền cảnh, một ở hậu cảnh) để khi máy quay zoom/pan qua vẫn có gì để xem.
   Nhân vật chính vẽ TO và RÕ ở tiền cảnh, không nhỏ tí hút vào phối cảnh xa.
3. CÓ CHIỀU SÂU: dùng phối cảnh (đường nhỏ dần về xa, người ở xa vẽ nhỏ và mờ hơn),
   1-2 đạo cụ kể chuyện (đồng hồ, vali, dấu chân, bóng bay...). Không để nền trống trơn.
4. NHÂN VẬT CHÍNH: người que vẽ tay mặc ÁO SƠ MI đơn giản có cổ (không phải bộ xương que),
   nét vẽ tay hơi run tự nhiên như phấn trắng, KHÔNG đều tăm tắp kiểu máy.
5. BỐ CỤC: chừa trống hoàn toàn 25% trên cùng của khung (chỗ đặt phụ đề), trọng tâm hình
   ở giữa-dưới. Khung dọc 9:16.
6. TUYỆT ĐỐI: không chữ/số/ký tự trong hình, không màu (chỉ trắng + xám trên nền đen),
   không ảnh thật, không 3D.

ĐOÀN NHÂN VẬT CỐ ĐỊNH CỦA KÊNH (chỉ được chọn trong danh sách này):
{mo_ta_dan}
Với MỖI cảnh, chọn 1-2 nhân vật phù hợp nhất từ danh sách trên (cảnh 1 người thì chọn 1;
cảnh đối thoại/đối lập chọn 2; đám đông vẫn chọn 1 vì người phía sau vẽ nhỏ và mờ).
Nhân vật mặc định cho hầu hết cảnh là nhân vật nam chính.

TRẢ VỀ JSON THUẦN (không markdown): mảng các object
  {{"so_thu_tu": <số>, "nhan_vat": ["<tên trong danh sách>", ...],
   "prompt": "<prompt vẽ TIẾNG ANH 60-120 từ, tả rõ: ẩn dụ gì, nhân vật
  làm gì, đạo cụ gì, bố cục xa gần thế nào>"}}
Kèm 1 object cuối: {{"so_thu_tu": 0, "prompt": "<prompt vẽ NHÂN VẬT GỐC đứng trung tính:
simple hand-drawn white stick-style character wearing a simple collared shirt, black background>"}}"""

resp = client.models.generate_content(
    model=MODEL, contents=prompt,
    config=types.GenerateContentConfig(temperature=0.8),  # cần sáng tạo ẩn dụ
)
text = resp.text.strip()
if text.startswith("```"):
    text = text.split("```")[1]
    if text.startswith("json"):
        text = text[4:]
    text = text.strip()

try:
    moi = json.loads(text)
except json.JSONDecodeError as e:
    (job / "dao-dien.raw.txt").write_text(text)
    sys.exit(f"❌ JSON đạo diễn hỏng ({e}) — giữ prompt cũ, xem dao-dien.raw.txt")

bang = {int(x["so_thu_tu"]): x["prompt"] for x in moi if "so_thu_tu" in x and x.get("prompt")}
bang_nv = {int(x["so_thu_tu"]): [n for n in (x.get("nhan_vat") or []) if n in dan]
           for x in moi if "so_thu_tu" in x}
so_thay = 0
for c in data["canh"]:
    p = bang.get(int(c["so_thu_tu"]))
    if p and len(p) > 40:
        c["prompt_kem_anh_goc"] = p
        so_thay += 1
    nv = bang_nv.get(int(c["so_thu_tu"]))
    if nv:
        c["nhan_vat"] = nv[:2]
if bang.get(0):
    data["prompt_nhan_vat_goc"] = bang[0]

if so_thay < len(data["canh"]) // 2:
    sys.exit(f"❌ Đạo diễn chỉ trả {so_thay}/{len(data['canh'])} cảnh — giữ prompt cũ cho an toàn")

data["dao_dien"] = True
pa.write_text(json.dumps(data, ensure_ascii=False, indent=2))
print(f"✅ Đạo diễn xong {so_thay}/{len(data['canh'])} cảnh + nhân vật gốc")

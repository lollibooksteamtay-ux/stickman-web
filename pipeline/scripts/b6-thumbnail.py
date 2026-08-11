#!/usr/bin/env python3
"""B6: tạo ẢNH BÌA cho video — theo mẫu Hoàng chốt 06/08.
Chạy: python b6-thumbnail.py <job-dir> "<chữ bìa>" [tên-ảnh-nền]
  - chữ bìa: "DÒNG TRẮNG | DÒNG VÀNG" (không có | thì 2 từ cuối tự thành vàng)
  - tên-ảnh-nền: vd "canh-04.png" — bỏ trống thì tự chọn cảnh nhiều nét vẽ nhất

Ra 3 file trong job-dir:
  thumbnail.jpg  1080x1430 — tải lên TikTok/Facebook (khổ Hoàng chốt, không bị cắt chữ)
  bia-video.png  1080x1920 — khung bìa gắn vào ĐẦU video (b7 dùng)
  thumb.jpg       270x357  — ảnh nhỏ trên lưới web
"""
import os
import pathlib
import sys

from PIL import Image, ImageDraw, ImageFont

job = pathlib.Path(sys.argv[1]).expanduser()
chu = (sys.argv[2] if len(sys.argv) > 2 else "").strip()
anh_chon = (sys.argv[3] if len(sys.argv) > 3 else "").strip()
anh_dir = job / "anh"

FONT_HEAVY = os.environ.get("FONT_FILE_HEAVY", "/usr/share/fonts/truetype/noto/NotoSans-Black.ttf")
if not pathlib.Path(FONT_HEAVY).exists():
    FONT_HEAVY = "/usr/share/fonts/truetype/noto/NotoSans-Bold.ttf"

# Chữ Khmer bắt buộc font Khmer — TỰ nhận diện theo nội dung, không chờ env truyền vào.
# (Bẫy 11/08: nút "Sửa bìa" trên web chạy b6 KHÔNG kèm FONT_FILE_HEAVY → bìa Khmer vỡ font.)
_chu_kiem = " ".join(sys.argv[2:3])
try:
    _chu_kiem += (job / "title.txt").read_text()
except Exception:
    pass
if any("\u1780" <= ch <= "\u17ff" for ch in _chu_kiem) and "khmer" not in FONT_HEAVY.lower():
    for _f in ("/usr/share/fonts/truetype/noto/NotoSansKhmer-Black.ttf",
               "/usr/share/fonts/truetype/noto/NotoSansKhmer-Bold.ttf"):
        if pathlib.Path(_f).exists():
            FONT_HEAVY = _f
            break
MAU_VANG = "#" + os.environ.get("CHU_MAU", "FFD700").strip().lstrip("#")
BRAND = os.environ.get("BRAND", "").strip()


def do_net(p):
    try:
        im = Image.open(p).convert("L").resize((108, 143))
        return sum(1 for v in im.getdata() if v > 100)
    except Exception:
        return -1


cac_anh = sorted(anh_dir.glob("canh-*.png"))
if not cac_anh:
    sys.exit("❌ Không có ảnh cảnh nào để làm bìa")
if anh_chon and (anh_dir / anh_chon).exists():
    nen_path = anh_dir / anh_chon
else:
    nen_path = max(cac_anh, key=do_net)

# Tách chữ trắng / vàng
trang, vang = "", ""
if chu:
    if "|" in chu:
        trang, vang = (p.strip() for p in chu.split("|", 1))
    else:
        tu = chu.split()
        if len(tu) >= 4:
            trang, vang = " ".join(tu[:-2]), " ".join(tu[-2:])
        else:
            vang = chu


def ve_bia(W, H, dich_xuong=0.10):
    """Vẽ 1 bản bìa cỡ WxH, trả về Image."""
    nen = Image.open(nen_path).convert("RGB")
    ti_le = max(W / nen.width, H / nen.height)
    nen2 = nen.resize((int(nen.width * ti_le), int(nen.height * ti_le)), Image.LANCZOS)
    x0 = (nen2.width - W) // 2
    y0 = min((nen2.height - H) // 2 + int(H * dich_xuong), nen2.height - H)
    y0 = max(y0, 0)
    img = nen2.crop((x0, y0, x0 + W, y0 + H))
    d = ImageDraw.Draw(img)

    def _be_tu_dai(t, font, max_rong):
        """Từ đơn quá rộng (chữ Khmer viết liền không dấu cách) → chặt theo CỤM KÝ TỰ.
        Chỉ được cắt TRƯỚC phụ âm gốc Khmer (U+1780-17B3) và không cắt sau dấu ghép ្ (17D2)
        — cắt bừa giữa cụm là chữ vỡ. Đã dính bẫy 11/08: dòng vàng tràn 2 mép bìa."""
        if d.textlength(t, font=font) <= max_rong:
            return [t]
        manh, hien = [], ""
        for i, ch in enumerate(t):
            cat_duoc = ("\u1780" <= ch <= "\u17b3") and i > 0 and t[i - 1] != "\u17d2"
            if hien and cat_duoc and d.textlength(hien + ch, font=font) > max_rong:
                manh.append(hien)
                hien = ch
            else:
                hien += ch
        if hien:
            manh.append(hien)
        return manh

    def be_dong(text, font, max_rong):
        tu, dong, cac_dong = [], "", []
        for t in text.split():
            tu.extend(_be_tu_dai(t, font, max_rong))
        for t in tu:
            thu = f"{dong} {t}".strip()
            if d.textlength(thu, font=font) > max_rong and dong:
                cac_dong.append(dong)
                dong = t
            else:
                dong = thu
        if dong:
            cac_dong.append(dong)
        return cac_dong

    def ve_khoi(text, mau, co_max, y):
        for co in range(co_max, 40, -8):
            font = ImageFont.truetype(FONT_HEAVY, co)
            cac_dong = be_dong(text, font, W - 100)
            if len(cac_dong) <= 2:
                break
        for dg in cac_dong:
            rong = d.textlength(dg, font=font)
            d.text(((W - rong) / 2, y), dg, font=font, fill=mau, stroke_width=7, stroke_fill="black")
            y += int(co * 1.24)
        return y + 8

    y = int(H * 0.058)
    if trang:
        y = ve_khoi(trang.upper(), "white", 78, y)
    if vang:
        ve_khoi(vang.upper(), MAU_VANG, 128, y)
    if BRAND:
        fb = ImageFont.truetype(FONT_HEAVY, 44)
        rong = d.textlength(BRAND, font=fb)
        d.text(((W - rong) / 2, H - 110), BRAND, font=fb, fill=MAU_VANG, stroke_width=4, stroke_fill="black")
    return img


# Bản 1080x1430 để tải lên nền tảng + thumb nhỏ cho web
bia = ve_bia(1080, 1430)
bia.save(job / "thumbnail.jpg", "JPEG", quality=92)
bia.resize((270, 357), Image.LANCZOS).save(job / "thumb.jpg", "JPEG", quality=85)

# Bản 1080x1920 làm khung đầu video (đúng khổ video)
ve_bia(1080, 1920, dich_xuong=0.06).save(job / "bia-video.png")

print(f"✅ Bìa từ {nen_path.name}: thumbnail.jpg 1080x1430 + bia-video.png 1080x1920 + thumb.jpg")

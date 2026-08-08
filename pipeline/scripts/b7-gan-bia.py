#!/usr/bin/env python3
"""B7: gắn/gỡ ảnh bìa ở ĐẦU video (kiểu CapCut — mọi nền tảng đều hiện đúng bìa).
Chạy: python b7-gan-bia.py <job-dir> <bat|tat>
  bat: final.mp4 = 0,3s bìa (bia-video.png) + video sạch
  tat: final.mp4 = video sạch (không bìa)
Lần đầu chạy sẽ giữ bản gốc thành final-sach.mp4 để bật/tắt bao nhiêu lần cũng được.
"""
import os
import pathlib
import subprocess
import sys

FF = os.environ.get("FFMPEG_BIN", "ffmpeg")
BIA_GIAY = float(os.environ.get("BIA_GIAY", "0.3"))

job = pathlib.Path(sys.argv[1]).expanduser()
che_do = sys.argv[2] if len(sys.argv) > 2 else "bat"

final = job / "final.mp4"
sach = job / "final-sach.mp4"
bia = job / "bia-video.png"

if not final.exists() and not sach.exists():
    sys.exit("❌ Chưa có video để gắn bìa")

# Bảo toàn bản sạch: lần đầu (chưa có final-sach) thì final hiện tại chính là bản sạch
if not sach.exists():
    final.rename(sach)

if che_do == "tat":
    subprocess.run(["cp", str(sach), str(final)], check=True)
    print("✅ Đã gỡ bìa khỏi đầu video")
    sys.exit(0)

if not bia.exists():
    sys.exit("❌ Thiếu bia-video.png — chạy b6 trước")


def run(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        sys.exit(f"❌ ffmpeg lỗi:\n{r.stderr[-1200:]}")


# Đọc sample rate audio của bản sạch để khớp khi nối
r = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "a:0",
                    "-show_entries", "stream=sample_rate", "-of", "csv=p=0", str(sach)],
                   capture_output=True, text=True)
sr = (r.stdout.strip() or "24000")

tmp = job / "tmp"
tmp.mkdir(exist_ok=True)
clip_bia = tmp / "clip-bia.mp4"
run([FF, "-y", "-loglevel", "error",
     "-loop", "1", "-framerate", "30", "-t", f"{BIA_GIAY:.2f}", "-i", str(bia),
     "-f", "lavfi", "-i", f"anullsrc=r={sr}:cl=stereo:d={BIA_GIAY:.2f}",
     "-vf", "scale=1080:1920,fps=30", "-map", "0:v", "-map", "1:a",
     "-c:v", "libx264", "-crf", "20", "-preset", "veryfast", "-pix_fmt", "yuv420p",
     "-c:a", "aac", "-ar", sr, str(clip_bia)])

# Nối bìa + video sạch (concat filter, re-encode để chắc chắn tương thích)
run([FF, "-y", "-loglevel", "error", "-i", str(clip_bia), "-i", str(sach),
     "-filter_complex", "[0:v][0:a][1:v][1:a]concat=n=2:v=1:a=1[v][a]",
     "-map", "[v]", "-map", "[a]",
     "-c:v", "libx264", "-crf", "20", "-preset", "veryfast", "-pix_fmt", "yuv420p",
     "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", str(final)])
print(f"✅ Đã gắn bìa {BIA_GIAY}s vào đầu video")

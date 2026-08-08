#!/usr/bin/env python3
"""B4: đọc phan-tich.json -> tạo voice tiếng Việt cho TỪNG CẢNH (Gemini TTS, free tier).
Chạy: uv run --python 3.12 --with google-genai python scripts/b4-tao-voice.py jobs/<ten-job>
Tách voice theo cảnh để B5 tự khớp thời lượng ảnh = thời lượng tiếng.
"""
import json
import os
import pathlib
import struct
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
MODEL = os.environ.get("MODEL_TTS", "gemini-2.5-flash-preview-tts")
GIONG = os.environ.get("GIONG_DOC", "Kore")  # đổi trong .env nếu muốn giọng khác
PHONG_CACH = os.environ.get("PHONG_CACH_DOC", "Đọc chậm rãi, trầm ấm, tâm tình như đang thủ thỉ")

job = pathlib.Path(sys.argv[1]).expanduser()
data = json.loads((job / "phan-tich.json").read_text())
voice_dir = job / "voice"
voice_dir.mkdir(exist_ok=True)

from google import genai  # noqa: E402
from google.genai import types  # noqa: E402

client = genai.Client(api_key=KEY)


def luu_wav(pcm: bytes, path: pathlib.Path, rate=24000):
    """Gemini TTS trả PCM 16-bit mono 24kHz — tự đóng header WAV."""
    header = struct.pack(
        "<4sI4s4sIHHIIHH4sI",
        b"RIFF", 36 + len(pcm), b"WAVE", b"fmt ", 16, 1, 1,
        rate, rate * 2, 2, 16, b"data", len(pcm),
    )
    path.write_bytes(header + pcm)


cfg = types.GenerateContentConfig(
    response_modalities=["AUDIO"],
    speech_config=types.SpeechConfig(
        voice_config=types.VoiceConfig(
            prebuilt_voice_config=types.PrebuiltVoiceConfig(voice_name=GIONG)
        )
    ),
)

loi = []
for c in data["canh"]:
    i = c["so_thu_tu"]
    out = voice_dir / f"canh-{i:02d}.wav"
    text = (c.get("loi_thoai") or "").strip()
    if not text:
        print(f"  ⏭ cảnh {i}: không có lời")
        continue
    if out.exists():
        print(f"  ⏭ cảnh {i} đã có")
        continue
    ok = False
    for attempt in range(3):
        try:
            resp = client.models.generate_content(
                model=MODEL,
                contents=f"Đọc nguyên văn đoạn sau bằng tiếng Việt ({PHONG_CACH}), chỉ đọc, không trả lời: {text}",
                config=cfg,
            )
            part = resp.candidates[0].content.parts[0]
            luu_wav(part.inline_data.data, out)
            print(f"  ✅ cảnh {i}: {len(text)} ký tự")
            ok = True
            break
        except Exception as e:
            print(f"  ⚠️ cảnh {i}: {e} — thử lại sau 15s")
            time.sleep(15)
    if not ok:
        loi.append(i)
    time.sleep(2)

if loi:
    print(f"⚠️ Cảnh lỗi (chạy lại để bù): {loi}")
    sys.exit(1)
print(f"✅ Voice xong: {voice_dir}")

# Cách mở phiên Claude Code mới cho dự án này

## Bước 1 — Mở phiên trỏ đúng thư mục

```bash
cd ~/vibe-apps/stickman-web && claude
```

Claude sẽ **tự đọc `CLAUDE.md`** trong thư mục này → nắm hết bối cảnh, không cần kể lại.

## Bước 2 — Dán câu mở đầu này vào phiên mới

```
Đọc kỹ CLAUDE.md trong thư mục này trước.

Anh muốn làm web app cho nhiều người dùng đăng nhập, dán link video mẫu là ra
video người que hoàn chỉnh. Bản chạy tay trên máy đã có ở ~/Desktop/stickman-studio
(đọc luôn cả code lẫn file ref trong đó, ĐỪNG viết lại từ đầu).

Việc đầu tiên: kiểm chứng lại hiện trạng bằng cách chạy thật, đừng tin suông
những gì ghi trong CLAUDE.md — nhất là mục nút thắt tạo ảnh và các model Gemini
còn dùng được. Xong báo em kết quả.

Sau đó hỏi anh 3 quyết định còn treo (ai trả tiền API, ai được vào, giữ video
bao lâu), rồi mới lên kế hoạch Phase 1.
```

## Nếu muốn phiên mới lên kế hoạch trước khi code

Gõ thêm dòng này sau câu trên:
```
Dùng plan mode: khảo sát và trình kế hoạch cho anh duyệt trước, chưa code vội.
```

---

## Ghi nhớ nhanh — dán khi cần

**Thư mục liên quan:**
- `~/vibe-apps/stickman-web` — dự án web app (thư mục này)
- `~/Desktop/stickman-studio` — bản chạy tay, đã hoạt động, dùng để port
- `~/Desktop/video-studio` — xưởng dựng video của anh Tây, có `philosophy/skills.md` chứa nhiều bẫy ffmpeg đã gặp

**Nút thắt cần gỡ trước khi app có ý nghĩa:** tạo ảnh (B3) — Gemini free `limit: 0`, Pollinations đã thu phí, billing $300 bị tổ chức chặn 2 lần. Chưa test Cloudflare Workers AI.

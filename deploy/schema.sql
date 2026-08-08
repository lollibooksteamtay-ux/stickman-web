-- Schema stickman — chạy 1 lần khi khởi tạo (idempotent)
CREATE TABLE IF NOT EXISTS users (
  id         SERIAL PRIMARY KEY,
  username   TEXT UNIQUE NOT NULL,              -- tên đăng nhập ngắn gọn (tay, van, hiep...)
  email      TEXT,                              -- tuỳ chọn, không dùng để đăng nhập
  name       TEXT NOT NULL DEFAULT '',
  pass_hash  TEXT NOT NULL,
  role       TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user','admin')),
  status     TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','locked')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS jobs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      INT NOT NULL REFERENCES users(id),
  source_url   TEXT NOT NULL,
  title        TEXT NOT NULL DEFAULT 'Video mới',
  status       TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','done','error')),
  step         INT NOT NULL DEFAULT 0,          -- 0 chờ, 1..5 = B1..B5
  step_note    TEXT NOT NULL DEFAULT '',        -- vd "tạo ảnh cảnh 5/8"
  error_text   TEXT NOT NULL DEFAULT '',
  scenes       INT NOT NULL DEFAULT 0,
  file_size    BIGINT NOT NULL DEFAULT 0,
  file_deleted BOOLEAN NOT NULL DEFAULT false,  -- quá hạn lưu: file xoá, dòng giữ lại để đếm
  user_deleted BOOLEAN NOT NULL DEFAULT false,  -- người dùng bấm Xoá: file xoá hẳn, ẩn khỏi danh sách user, admin vẫn đếm
  anh_tam      BOOLEAN NOT NULL DEFAULT false,  -- true = dựng bằng ảnh mẫu (chưa có key ảnh)
  voice_mode   TEXT NOT NULL DEFAULT 'ai' CHECK (voice_mode IN ('ai','upload')),
  giong        TEXT NOT NULL DEFAULT '',        -- tên giọng Gemini người dùng chọn (voice_mode=ai)
  audio_ext    TEXT NOT NULL DEFAULT '',        -- đuôi file audio tải lên (voice_mode=upload)
  nhac_nhom    TEXT NOT NULL DEFAULT '',        -- '' ngẫu nhiên · 'khong' · 'nhom:x' · 'bai:x/y' · 'upload'
  bia_text     TEXT NOT NULL DEFAULT '',        -- chữ ảnh bìa "TRẮNG | VÀNG" ('' = dùng tiêu đề)
  bia_anh      TEXT NOT NULL DEFAULT '',        -- ảnh cảnh làm nền bìa ('' = tự chọn cảnh đậm nét nhất)
  bia_dau      BOOLEAN NOT NULL DEFAULT true,   -- gắn bìa 0,3s vào đầu video (kiểu CapCut)
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at   TIMESTAMPTZ,
  finished_at  TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_jobs_user    ON jobs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_jobs_status  ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_created ON jobs(created_at);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT ''
);

INSERT INTO settings(key, value) VALUES
  ('gemini_key_text',  ''),                          -- key cho B2 phân tích + B4 voice
  ('gemini_key_image', ''),                          -- key cho B3 tạo ảnh (anh Tây cắm sau)
  ('mock_anh',         '1'),                         -- 1 = chưa có key ảnh thì dùng ảnh mẫu
  ('retention_days',   '7'),
  ('model_phan_tich',  'gemini-3.6-flash'),
  ('model_anh',        'gemini-3.1-flash-lite-image'),  -- rẻ ~1/2 flash-image, chất lượng tương đương (đã so sánh 06/08)
  ('model_tts',        'gemini-3.1-flash-tts-preview'),
  ('giong_doc',        'Kore'),
  ('phong_cach_doc',   'Đọc nhanh gọn, dứt khoát, tự nhiên như người kể chuyện video ngắn TikTok, không kéo dài giọng, không ngắt nghỉ lâu'),
  ('nen_mau',          'solid black background'),
  ('net_mau',          'clean white line art'),
  ('chu_mau',          'FFD700'),
  ('brand',            ''),
  ('nhac_vol',         '0.1')
ON CONFLICT (key) DO NOTHING;

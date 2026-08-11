#!/usr/bin/env node
/**
 * Worker dựng video stickman — chạy nền qua systemd (stickman-worker.service).
 * Nhiệm vụ: lấy job 'queued' từ Postgres → chạy B1..B5 → cập nhật tiến độ → done/error.
 * Tối đa MAX_SONG_SONG job cùng lúc. Kèm vòng dọn dẹp video quá hạn (giữ lịch sử + thumb).
 */
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { Pool } = require('pg');

// ── Đọc .env thủ công (systemd cũng nạp qua EnvironmentFile, đây là fallback chạy tay) ──
(function napEnv() {
  const f = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(f)) return;
  for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
    const l = line.trim();
    if (!l || l.startsWith('#') || !l.includes('=')) continue;
    const i = l.indexOf('=');
    const k = l.slice(0, i).trim();
    if (!(k in process.env)) process.env[k] = l.slice(i + 1).trim();
  }
})();

const STORAGE = process.env.STORAGE_DIR || '/opt/stickman/storage';
const PIPELINE = process.env.PIPELINE_DIR || '/opt/stickman/pipeline';
const PYTHON = process.env.PYTHON_BIN || '/opt/stickman/venv/bin/python3';
const YTDLP = process.env.YTDLP_BIN || '/opt/stickman/venv/bin/yt-dlp';
const FFMPEG = process.env.FFMPEG_BIN || 'ffmpeg';
const MAX_SONG_SONG = parseInt(process.env.MAX_SONG_SONG || '2', 10);

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 4 });
const dangChay = new Set(); // job id đang xử lý trong process này

function log(...a) {
  console.log(new Date().toISOString().slice(11, 19), ...a);
}

async function q(text, params) {
  return pool.query(text, params);
}

async function docSettings() {
  const r = await q('SELECT key, value FROM settings');
  return Object.fromEntries(r.rows.map((x) => [x.key, x.value]));
}

async function capNhat(jobId, fields) {
  const keys = Object.keys(fields);
  const sets = keys.map((k, i) => `${k}=$${i + 2}`).join(', ');
  await q(`UPDATE jobs SET ${sets} WHERE id=$1`, [jobId, ...keys.map((k) => fields[k])]);
}

// ── Chạy lệnh con, stream stdout để bắt tiến độ ─────────────────────────────
function chay(cmd, args, { env = {}, onLine, timeoutPhut = 20 } = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, {
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '', err = '';
    const timer = setTimeout(() => {
      p.kill('SIGKILL');
      reject(new Error(`Quá ${timeoutPhut} phút không xong — huỷ`));
    }, timeoutPhut * 60_000);
    const bat = (chunk, kho) => {
      const s = chunk.toString();
      if (kho === 'out') out += s; else err += s;
      if (onLine) for (const line of s.split('\n')) if (line.trim()) onLine(line.trim());
    };
    p.stdout.on('data', (c) => bat(c, 'out'));
    p.stderr.on('data', (c) => bat(c, 'err'));
    p.on('error', (e) => { clearTimeout(timer); reject(e); });
    p.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve({ out, err });
      else reject(new Error((err || out).trim().split('\n').slice(-4).join(' | ').slice(-500) || `exit ${code}`));
    });
  });
}

// ── Các bước B1..B5 ─────────────────────────────────────────────────────────
async function b1TaiVideo(job, dir) {
  const titleFile = path.join(dir, 'title.txt');
  // Facebook/TikTok hay hỏng CHẬP CHỜN (đo 08/08: cùng link, lần 1 "Cannot parse data", lần 2 tải được)
  // → thử lại tối đa 3 lượt, nghỉ giữa các lượt. Hỏng 1 lượt mà bỏ job là phí công người dùng.
  const LUOT = 3;
  for (let luot = 1; luot <= LUOT; luot++) {
    try {
      await chay(YTDLP, [
        '-f', 'mp4/best',
        '--max-filesize', '200M',
        '--no-playlist',
        '--no-simulate',
        '--print-to-file', '%(title)s', titleFile,
        '-o', path.join(dir, 'goc.%(ext)s'),
        job.source_url,
      ], { timeoutPhut: 10 });
      break;
    } catch (e) {
      if (luot === LUOT) throw e;
      console.log(`  ⚠️ tải lượt ${luot} hỏng (${String(e.message).slice(0, 90)}) → thử lại`);
      await new Promise((r) => setTimeout(r, 8000 * luot));
    }
  }

  // Bảo đảm có goc.mp4 (nguồn trả .webm/.mkv thì chuyển vỏ)
  const goc = path.join(dir, 'goc.mp4');
  if (!fs.existsSync(goc)) {
    const khac = fs.readdirSync(dir).find((f) => f.startsWith('goc.') && f !== 'goc.mp4');
    if (!khac) throw new Error('yt-dlp không tải được video nào');
    await chay(FFMPEG, ['-y', '-loglevel', 'error', '-i', path.join(dir, khac), '-c', 'copy', goc]);
  }
  // Cập nhật tiêu đề thật của video mẫu
  if (fs.existsSync(titleFile)) {
    const title = fs.readFileSync(titleFile, 'utf8').trim().slice(0, 150);
    if (title) await capNhat(job.id, { title });
  }
}

// Lỗi nào thì nên nhảy sang key khác (hết quota / hết credit / key hỏng)
function nenDoiKey(msg) {
  const m = String(msg);
  return /RESOURCE_EXHAUSTED|429|quota|credits are depleted|API_KEY_INVALID|API key not valid|PERMISSION_DENIED|403/i.test(m);
}

// Danh sách key free anh Tây dán trong Quản trị (mỗi dòng 1 key)
function keysFree(st) {
  return String(st.gemini_keys_free || '')
    .split(/[\n,;\s]+/).map((x) => x.trim()).filter((x) => x.length > 20);
}

/** Chạy script AI với KHO KEY. LUẬT CỨNG (anh Tây chốt 07/08):
 *  - Vẽ ảnh (keyAnh=true)  → CHỈ key trả phí (free tier bị Google chặn, limit:0)
 *  - Mọi bước khác         → CHỈ key free, luân phiên. TUYỆT ĐỐI KHÔNG rơi về key trả phí.
 *    Hết quota tất cả key free → job lỗi có hướng dẫn, KHÔNG âm thầm tiêu tiền. */
async function chayAI(args, { st, keyAnh = false, job, buoc, onLine, timeoutPhut = 12, themEnv = {} }) {
  const dsKey = keyAnh
    ? [{ ten: 'trả phí', key: st.gemini_key_image }]
    : keysFree(st).map((k, i) => ({ ten: `free #${i + 1}`, key: k }));
  const co = dsKey.filter((x) => x.key);
  if (!co.length) {
    throw new Error(keyAnh
      ? 'Chưa cắm key trả phí để vẽ ảnh — vào Quản trị dán key'
      : '⚠️ Kho key free đang trống — vào Quản trị dán key free (bước này không dùng key trả phí)');
  }

  let cuoi;
  for (let i = 0; i < co.length; i++) {
    try {
      return await chay(PYTHON, args, {
        env: { ...envPipeline(st, keyAnh), ...themEnv, GEMINI_API_KEY: co[i].key },
        onLine, timeoutPhut,
      });
    } catch (e) {
      cuoi = e;
      const doi = nenDoiKey(e.message) && i < co.length - 1;
      log(`${doi ? '🔑' : '❌'} job ${job.id.slice(0, 8)} ${buoc}: key ${co[i].ten} lỗi` +
          `${doi ? ` → thử ${co[i + 1].ten}` : ''} (${String(e.message).slice(-90)})`);
      if (!doi) break;
    }
  }
  // Hết cả kho key → báo lỗi bằng tiếng người
  if (nenDoiKey(cuoi?.message)) {
    if (keyAnh) {
      throw new Error(/credits are depleted/i.test(cuoi.message)
        ? '⚠️ Key trả phí đã HẾT CREDIT (chỉ dùng để vẽ ảnh) — nạp thêm ở aistudio.google.com rồi bấm Chạy lại'
        : '⚠️ Key trả phí bị chặn/hết quota khi vẽ ảnh — kiểm tra key ở Quản trị');
    }
    throw new Error(`⚠️ Hết quota cả ${co.length} key free ở bước "${buoc}" — thêm key free ở Quản trị `
      + 'hoặc chờ sang ngày (bước này KHÔNG dùng key trả phí theo cấu hình)');
  }
  throw cuoi;
}

/** Env theo thị trường của job. Campuchia: dịch Khmer, đọc Khmer, font Khmer.
 *  KY_TU_GIAY đo thật 11/08: Khmer 14,61 ký tự/giây (Việt 17,97) — sai số này mà bỏ qua
 *  thì bộ chia cảnh ~6s sẽ chia lệch ~19%. SUB_KY_TU hạ 26→22 vì chữ Khmer bề ngang rộng hơn. */
function envThiTruong(job) {
  if ((job.thi_truong || 'vn') !== 'kh') return {};
  return {
    NGON_NGU: 'kh',
    KY_TU_GIAY: '14.61',
    SUB_KY_TU: '22',
    FONT_CHU: 'Noto Sans Khmer',
    FONT_FILE_HEAVY: '/usr/share/fonts/truetype/noto/NotoSansKhmer-Black.ttf',
  };
}

function envPipeline(st, keyAnh = false) {
  return {
    PYTHONUNBUFFERED: '1', // để tiến độ "cảnh 5/10" nhảy realtime, không dồn cuối
    GEMINI_API_KEY: keyAnh ? st.gemini_key_image : st.gemini_key_text,
    MODEL_PHAN_TICH: st.model_phan_tich || 'gemini-3.6-flash',
    MODEL_ANH: st.model_anh || 'gemini-3.1-flash-image',
    // Nguồn ảnh ngoài (key4u): rẻ hơn Google 41%. Chỉ bật khi đủ 3 ô; hỏng thì b3 tự về Google.
    ANH_URL: keyAnh ? (st.anh_url || '') : '',
    ANH_KEY: keyAnh ? (st.anh_key || '') : '',
    ANH_MODEL: keyAnh ? (st.anh_model || '') : '',
    MODEL_TTS: st.model_tts || 'gemini-3.1-flash-tts-preview',
    GIONG_DOC: st.giong_doc || 'Kore', // bị ghi đè theo job nếu người dùng chọn giọng
    PHONG_CACH_DOC: st.phong_cach_doc || '',
    NEN_MAU: st.nen_mau || 'solid black background',
    NET_MAU: st.net_mau || 'clean white line art',
    CHU_MAU: st.chu_mau || 'FFFFFF',
    BRAND: st.brand || '',
    NHAC_VOL: st.nhac_vol || '0.18',
    FONT_CHU: st.font_chu || 'Noto Sans',
  };
}

// jobs.nhac_nhom: '' = ngẫu nhiên kho · 'khong' = tắt · 'nhom:x' = ngẫu nhiên nhóm
// 'bai:nhom/ten.mp3' = bài cụ thể · 'upload' = file người dùng tải kèm (nhac-rieng.<ext>)
function envNhac(job, dir) {
  const v = job.nhac_nhom || '';
  if (v === 'khong') return { NHAC_NHOM: 'khong' };
  if (v === 'upload') {
    const f = fs.readdirSync(dir).find((x) => x.startsWith('nhac-rieng.'));
    return f ? { NHAC: path.join(dir, f) } : {};
  }
  if (v.startsWith('bai:')) {
    const rel = v.slice(4).split('/').map((x) => path.basename(x)).join('/');
    const f = path.join(PIPELINE, 'assets', 'nhac', rel);
    return fs.existsSync(f) ? { NHAC: f } : {};
  }
  if (v.startsWith('nhom:')) return { NHAC_NHOM: path.basename(v.slice(5)) };
  return {};
}

function fileAudio(job, dir) {
  return job.voice_mode === 'upload' && job.audio_ext
    ? path.join(dir, `nguon-audio.${job.audio_ext}`)
    : null;
}

async function b2PhanTich(job, dir, st) {
  const paFile = path.join(dir, 'phan-tich.json');
  // Chạy lại job: kịch bản đã có thì dùng luôn — không phân tích lại (tốn tiền + lệch với ảnh đã vẽ)
  if (!fs.existsSync(paFile)) {
    if (!st.gemini_key_text) throw new Error('Chưa cắm key Gemini phân tích — vào Quản trị dán key');
    const audio = fileAudio(job, dir);
    if (audio && !fs.existsSync(audio)) throw new Error('Thiếu file audio đã tải lên');
    const args = audio
      ? [path.join(PIPELINE, 'scripts', 'b2-theo-audio.py'),
         job.source_url ? path.join(dir, 'goc.mp4') : '-', audio, paFile]
      : [path.join(PIPELINE, 'scripts', 'b2-phan-tich.py'), path.join(dir, 'goc.mp4'), paFile];
    await chayAI(args, { st, job, buoc: 'viết kịch bản', timeoutPhut: 12 });
    // B2t: thị trường Campuchia → dịch kịch bản sang tiếng Khmer (key free, 0đ).
    // Phải dịch TRƯỚC b2c: độ dài cảnh tính trên chữ tiếng đích, giọng đọc đọc tiếng đích.
    if ((job.thi_truong || 'vn') === 'kh') {
      await chayAI([path.join(PIPELINE, 'scripts', 'b2t-dich.py'), dir, 'kh'],
        { st, job, buoc: 'dịch sang tiếng Khmer', timeoutPhut: 6 });
    }
    // B2c: chuẩn hoá độ dài cảnh bằng CODE (~8s/cảnh, luôn cắt hết câu) — 0đ, không gọi AI.
    // AI đếm giây không tin được; nằm trong khối này để job cũ chạy lại KHÔNG bị xáo cảnh
    // (ảnh có thể đã vẽ theo cách chia cũ).
    await chay(PYTHON, [path.join(PIPELINE, 'scripts', 'b2c-chuan-canh.py'), dir],
      { timeoutPhut: 2, env: envThiTruong(job), onLine: (l) => log(`  ${l}`) });
  }
  // B2b: đạo diễn hình ảnh — nghĩ ẩn dụ + bố cục cho từng cảnh (bỏ qua nếu đã chạy)
  try {
    await chayAI([path.join(PIPELINE, 'scripts', 'b2b-dao-dien.py'), dir],
      { st, job, buoc: 'đạo diễn hình', timeoutPhut: 6 });
  } catch (e) {
    log(`⚠️ job ${job.id.slice(0, 8)} đạo diễn hình lỗi (dùng prompt gốc): ${String(e.message).slice(0, 120)}`);
  }
  const data = JSON.parse(fs.readFileSync(paFile, 'utf8'));
  const soCanh = (data.canh || []).length;
  if (!soCanh) throw new Error('Kịch bản không có cảnh nào — video mẫu có thể quá ngắn/không phù hợp');
  await capNhat(job.id, { scenes: soCanh });
  // Tiêu đề video = nội dung chính kịch bản (anh Tây yêu cầu) — hay hơn tên gốc từ yt-dlp
  const tieuDe = String(data.tieu_de || '').trim().slice(0, 120);
  if (tieuDe) await capNhat(job.id, { title: tieuDe });
  return soCanh;
}

async function b3TaoAnh(job, dir, st, soCanh) {
  const anhDir = path.join(dir, 'anh');
  fs.mkdirSync(anhDir, { recursive: true });

  if (st.gemini_key_image) {
    // Có key thật → vẽ ảnh AI, bắt tiến độ từng cảnh từ stdout
    await chayAI([path.join(PIPELINE, 'scripts', 'b3-tao-anh.py'), dir], {
      st, job, buoc: 'vẽ ảnh', keyAnh: true, timeoutPhut: 25,
      onLine: (line) => {
        const m = line.match(/✅ cảnh (\d+)/);
        if (m) capNhat(job.id, { step_note: `tạo ảnh cảnh ${m[1]}/${soCanh}` }).catch(() => {});
      },
    });
    return false; // không phải ảnh tạm
  }

  if (st.mock_anh === '1') {
    // Chưa có key → dùng ảnh người que mẫu cho mọi cảnh (video vẫn ra đủ voice + chữ + nhạc)
    const mau = path.join(PIPELINE, 'assets', 'anh-mau.png');
    for (let i = 1; i <= soCanh; i++) {
      const out = path.join(anhDir, `canh-${String(i).padStart(2, '0')}.png`);
      if (!fs.existsSync(out)) fs.copyFileSync(mau, out);
    }
    await capNhat(job.id, { step_note: `ảnh tạm ${soCanh} cảnh (chưa có key ảnh)`, anh_tam: true });
    return true;
  }

  throw new Error('Chưa cắm key Gemini tạo ảnh — vào Quản trị dán key hoặc bật chế độ ảnh tạm');
}

// Chỉ dẫn chất giọng theo voice — khớp với web/src/lib/voices.js
const VUNG_GIONG = {
  Charon: 'giọng nam miền Bắc chuẩn (Hà Nội)',
  Kore: 'giọng nữ miền Bắc chuẩn (Hà Nội)',
  Puck: 'giọng nam miền Nam (Sài Gòn)',
  Leda: 'giọng nữ miền Nam (Sài Gòn)',
  Fenrir: 'giọng nam trẻ sôi nổi, giàu năng lượng',
  Zephyr: 'giọng nữ sáng, tươi tắn',
  Aoede: 'giọng nữ nhẹ nhàng êm',
};

// Thị trường Campuchia: 4 giọng theo tuổi (anh Tây chốt 11/08) — chỉ dẫn tiếng Anh lái tuổi + chất giọng
const GIONG_KH_CHIDAN = {
  Puck: 'an energetic Cambodian young man in his early 20s, bright lively voice',
  Leda: 'a cheerful Cambodian young woman in her early 20s, clear friendly voice',
  Charon: 'a calm Cambodian man around 50 years old, deep warm steady voice',
  Kore: 'a composed Cambodian woman around 50 years old, warm firm trustworthy voice',
};

async function b4TaoVoice(job, dir, st, soCanh) {
  const giong = job.giong || st.giong_doc || 'Charon';
  const laKhmer = (job.thi_truong || 'vn') === 'kh';
  const vung = VUNG_GIONG[giong] || 'giọng miền Bắc chuẩn';
  const phongCach = laKhmer
    ? `speak as ${GIONG_KH_CHIDAN[giong] || GIONG_KH_CHIDAN.Charon}, brisk short-video narration pace, natural, no long pauses`
    : `Đọc bằng ${vung}, nhanh gọn, dứt khoát, tự nhiên như người kể chuyện video ngắn TikTok, không kéo dài giọng, không ngắt nghỉ lâu`;
  await chayAI([path.join(PIPELINE, 'scripts', 'b4-tao-voice.py'), dir], {
    st, job, buoc: 'đọc voice', timeoutPhut: 20,
    themEnv: { GIONG_DOC: giong, PHONG_CACH_DOC: phongCach, ...envThiTruong(job) },
    onLine: (line) => {
      const m = line.match(/✅ cảnh (\d+)/);
      if (m) capNhat(job.id, { step_note: `đọc voice cảnh ${m[1]}/${soCanh}` }).catch(() => {});
    },
  });
}

async function b5Ghep(job, dir, st) {
  const audio = fileAudio(job, dir);
  await chay(PYTHON, [path.join(PIPELINE, 'scripts', 'b5-ghep.py'), dir], {
    env: {
      ...envPipeline(st), PATH: process.env.PATH,
      ...envNhac(job, dir),
      ...envThiTruong(job),
      ...(audio ? { VOICE_FILE: audio } : {}),
    },
    timeoutPhut: 20,
  });
  const final = path.join(dir, 'final.mp4');
  if (!fs.existsSync(final)) throw new Error('Ghép xong nhưng không thấy final.mp4');
  return fs.statSync(final).size;
}

// Ảnh nhỏ tạm thời trong lúc job đang chạy (chưa có tiêu đề để làm bìa)
async function taoThumb(dir) {
  const nguon = path.join(dir, 'anh', 'canh-01.png');
  const thumb = path.join(dir, 'thumb.jpg');
  if (!fs.existsSync(nguon) || fs.existsSync(thumb)) return;
  try {
    await chay(FFMPEG, ['-y', '-loglevel', 'error', '-i', nguon, '-vf', 'scale=270:-2', '-q:v', '5', thumb]);
  } catch { /* thumb hỏng không chặn job */ }
}

// Ảnh bìa có chữ tiêu đề — ghi đè thumb.jpg để lưới video không còn đen thui
async function taoAnhBia(job, dir, st, tieuDe, anhNen = '') {
  try {
    await chay(PYTHON, [path.join(PIPELINE, 'scripts', 'b6-thumbnail.py'), dir, tieuDe || '', anhNen], {
      env: { ...envPipeline(st), ...envThiTruong(job) },
      timeoutPhut: 3,
    });
  } catch (e) {
    log(`⚠️ job ${job.id.slice(0, 8)} không tạo được ảnh bìa: ${e.message}`);
  }
}

// Gắn bìa 0,3s vào đầu video (mặc định bật — mọi nền tảng hiện đúng bìa kiểu CapCut)
async function ganBia(job, dir) {
  try {
    await chay(PYTHON, [path.join(PIPELINE, 'scripts', 'b7-gan-bia.py'), dir, 'bat'], {
      env: { ...process.env },
      timeoutPhut: 8,
    });
    const f = path.join(dir, 'final.mp4');
    if (fs.existsSync(f)) await capNhat(job.id, { file_size: fs.statSync(f).size });
  } catch (e) {
    log(`⚠️ job ${job.id.slice(0, 8)} không gắn được bìa đầu video: ${e.message}`);
  }
}

// ── Xử lý 1 job trọn vẹn ────────────────────────────────────────────────────
async function xuLyJob(job) {
  const dir = path.join(STORAGE, String(job.user_id), job.id);
  fs.mkdirSync(dir, { recursive: true });
  const st = await docSettings();
  log(`▶ job ${job.id.slice(0, 8)} của user ${job.user_id}: ${job.source_url.slice(0, 60)}`);

  try {
    if (job.source_url) {
      await capNhat(job.id, { step: 1, step_note: 'tải video mẫu' });
      await b1TaiVideo(job, dir);
    } else {
      // Chế độ audio không kèm link: bỏ B1, hình sẽ tự sáng tác theo audio
      await capNhat(job.id, { step: 1, step_note: 'không có video mẫu — bỏ qua' });
    }

    await capNhat(job.id, { step: 2, step_note: 'xem video + viết kịch bản' });
    const soCanh = await b2PhanTich(job, dir, st);

    await capNhat(job.id, { step: 3, step_note: 'tạo ảnh' });
    await b3TaoAnh(job, dir, st, soCanh);
    await taoThumb(dir);

    if (job.voice_mode === 'upload') {
      await capNhat(job.id, { step: 4, step_note: 'dùng audio đã tải lên' });
    } else {
      await capNhat(job.id, { step: 4, step_note: 'đọc voice tiếng Việt' });
      await b4TaoVoice(job, dir, st, soCanh);
    }

    await capNhat(job.id, { step: 5, step_note: 'ghép ảnh + chữ + nhạc' });
    const size = await b5Ghep(job, dir, st);

    // Ảnh bìa lấy tiêu đề mới nhất trong DB (B2 đã đặt theo nội dung kịch bản)
    const rt = await q('SELECT title, bia_text, bia_anh, bia_dau FROM jobs WHERE id=$1', [job.id]);
    await taoAnhBia(job, dir, st, rt.rows[0]?.bia_text || rt.rows[0]?.title, rt.rows[0]?.bia_anh || '');
    if (rt.rows[0]?.bia_dau !== false) await ganBia(job, dir);

    await q(
      `UPDATE jobs SET status='done', step=5, step_note='', file_size=$2, finished_at=now() WHERE id=$1`,
      [job.id, size]
    );
    log(`✅ job ${job.id.slice(0, 8)} xong (${(size / 1e6).toFixed(1)}MB)`);
  } catch (e) {
    const msg = String(e.message || e).slice(0, 500);
    await q(
      `UPDATE jobs SET status='error', error_text=$2, finished_at=now() WHERE id=$1`,
      [job.id, msg]
    ).catch(() => {});
    log(`❌ job ${job.id.slice(0, 8)} lỗi:`, msg);
  } finally {
    dangChay.delete(job.id);
  }
}

// ── Vòng lấy job ────────────────────────────────────────────────────────────
async function vongLayJob() {
  if (dangChay.size >= MAX_SONG_SONG) return;
  const r = await q(
    `UPDATE jobs SET status='running', started_at=now(), error_text=''
     WHERE id = (
       SELECT id FROM jobs WHERE status='queued' AND NOT user_deleted
       ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED
     )
     RETURNING *`
  );
  const job = r.rows[0];
  if (!job) return;
  dangChay.add(job.id);
  xuLyJob(job); // không await — cho phép job thứ 2 vào song song
}

// ── Dọn video quá hạn: xoá file to, GIỮ dòng DB + thumb.jpg để đếm lịch sử ──
async function donDep() {
  try {
    const st = await docSettings();
    const ngay = parseInt(st.retention_days || '7', 10);
    const r = await q(
      `SELECT id, user_id FROM jobs
       WHERE status IN ('done','error') AND NOT file_deleted
         AND finished_at < now() - make_interval(days => $1)`,
      [ngay]
    );
    for (const j of r.rows) {
      const dir = path.join(STORAGE, String(j.user_id), j.id);
      if (fs.existsSync(dir)) {
        for (const f of fs.readdirSync(dir)) {
          if (f === 'thumb.jpg') continue; // giữ thumbnail cho lưới lịch sử
          fs.rmSync(path.join(dir, f), { recursive: true, force: true });
        }
      }
      await q(`UPDATE jobs SET file_deleted=true WHERE id=$1`, [j.id]);
    }
    if (r.rowCount) log(`🧹 đã dọn ${r.rowCount} video quá ${ngay} ngày`);
  } catch (e) {
    log('⚠️ dọn dẹp lỗi:', e.message);
  }
}

// ── Khởi động ───────────────────────────────────────────────────────────────
(async function main() {
  // Job kẹt ở 'running' do worker chết giữa chừng → đưa lại hàng đợi
  const kẹt = await q(`UPDATE jobs SET status='queued', step=0, step_note='' WHERE status='running' RETURNING id`);
  if (kẹt.rowCount) log(`↻ đưa ${kẹt.rowCount} job kẹt về hàng đợi`);

  log(`Worker chạy — tối đa ${MAX_SONG_SONG} job song song, storage: ${STORAGE}`);
  setInterval(() => vongLayJob().catch((e) => log('⚠️ lấy job lỗi:', e.message)), 3000);
  donDep();
  setInterval(donDep, 60 * 60 * 1000); // mỗi giờ
})();

import fs from 'fs';
import path from 'path';
import { q } from '@/lib/db';
import { nguoiDung } from '@/lib/auth';
import { laGiongHopLe, GIONG_MAC_DINH } from '@/lib/voices';
import { laNhomHopLe } from '@/lib/nhac';

const MOI_TRANG = 20;
const AUDIO_EXT = new Set(['mp3', 'm4a', 'wav', 'aac', 'ogg']);
const AUDIO_MAX = 20 * 1024 * 1024; // 20MB — khớp client_max_body_size nginx

// GET /api/jobs?tab=all|running|fresh|error&page=1 — video của chính người đăng nhập
export async function GET(req) {
  const u = await nguoiDung();
  if (!u) return Response.json({ loi: 'Chưa đăng nhập' }, { status: 401 });

  const url = new URL(req.url);
  const tab = url.searchParams.get('tab') || 'all';
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));

  let dk = '';
  if (tab === 'running') dk = `AND status IN ('queued','running')`;
  if (tab === 'fresh') dk = `AND status='done' AND NOT file_deleted`;
  if (tab === 'error') dk = `AND status='error'`;

  const [ds, dem, thang] = await Promise.all([
    q(
      `SELECT id, title, status, step, step_note, error_text, scenes, file_deleted, anh_tam,
              voice_mode, giong, created_at, finished_at,
              CASE WHEN status='queued' THEN
                (SELECT count(*) FROM jobs j2 WHERE j2.status='queued' AND j2.created_at < jobs.created_at) + 1
              ELSE 0 END AS vi_tri_cho
       FROM jobs WHERE user_id=$1 AND NOT user_deleted ${dk}
       ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
      [u.id, MOI_TRANG, (page - 1) * MOI_TRANG]
    ),
    q(
      `SELECT
         count(*)::int AS tat_ca,
         count(*) FILTER (WHERE status IN ('queued','running'))::int AS dang_chay,
         count(*) FILTER (WHERE status='done' AND NOT file_deleted)::int AS con_han,
         count(*) FILTER (WHERE status='error')::int AS loi
       FROM jobs WHERE user_id=$1 AND NOT user_deleted`,
      [u.id]
    ),
    q(
      `SELECT count(*)::int AS tong,
              count(*) FILTER (WHERE status='done')::int AS xong,
              count(*) FILTER (WHERE status='error')::int AS loi
       FROM jobs WHERE user_id=$1
         AND date_trunc('month', created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')
           = date_trunc('month', now() AT TIME ZONE 'Asia/Ho_Chi_Minh')`,
      [u.id]
    ),
  ]);

  const demRow = dem.rows[0];
  const tongTab =
    tab === 'running' ? demRow.dang_chay :
    tab === 'fresh' ? demRow.con_han :
    tab === 'error' ? demRow.loi : demRow.tat_ca;

  return Response.json({
    jobs: ds.rows,
    dem: demRow,
    thang: thang.rows[0],
    page,
    so_trang: Math.max(1, Math.ceil(tongTab / MOI_TRANG)),
  });
}

// POST /api/jobs — tạo job mới.
// JSON {url, giong?} hoặc multipart (url, giong, voice_mode, audio) khi tải audio lên.
export async function POST(req) {
  const u = await nguoiDung();
  if (!u) return Response.json({ loi: 'Chưa đăng nhập' }, { status: 401 });

  let link = '', giong = '', voiceMode = 'ai', audioFile = null, nhacNhom = '', biaText = '', nhacFile = null, thiTruong = 'vn';
  const ct = req.headers.get('content-type') || '';
  if (ct.includes('multipart/form-data')) {
    const fd = await req.formData().catch(() => null);
    if (!fd) return Response.json({ loi: 'Dữ liệu gửi lên hỏng' }, { status: 400 });
    link = String(fd.get('url') || '').trim();
    giong = String(fd.get('giong') || '').trim();
    thiTruong = String(fd.get('thi_truong') || 'vn');
    voiceMode = String(fd.get('voice_mode') || 'ai');
    audioFile = fd.get('audio');
    nhacNhom = String(fd.get('nhac_nhom') || '').trim();
    biaText = String(fd.get('bia_text') || '').trim().slice(0, 100);
    nhacFile = fd.get('nhac');
  } else {
    const b = await req.json().catch(() => ({}));
    link = (b.url || '').trim();
    giong = (b.giong || '').trim();
    thiTruong = String(b.thi_truong || 'vn');
    voiceMode = b.voice_mode || 'ai';
    nhacNhom = (b.nhac_nhom || '').trim();
    biaText = (b.bia_text || '').trim().slice(0, 100);
  }
  // Giá trị nhạc hợp lệ: '' | 'khong' | 'upload' | 'nhom:<id>' | 'bai:<nhom>/<file>'
  const nhacOk = nhacNhom === '' || nhacNhom === 'khong' || nhacNhom === 'upload'
    || (nhacNhom.startsWith('nhom:') && laNhomHopLe(nhacNhom.slice(5)))
    || (nhacNhom.startsWith('bai:') && nhacNhom.length < 200 && !nhacNhom.includes('..'));
  if (!nhacOk) nhacNhom = '';
  if (nhacNhom === 'upload') {
    if (!nhacFile || typeof nhacFile === 'string' || !nhacFile.size) {
      return Response.json({ loi: 'Chưa chọn file nhạc nền' }, { status: 400 });
    }
    if (nhacFile.size > 15 * 1024 * 1024) return Response.json({ loi: 'File nhạc quá 15MB' }, { status: 400 });
    const duoiNhac = (nhacFile.name.split('.').pop() || '').toLowerCase();
    if (!['mp3', 'm4a', 'wav', 'aac'].includes(duoiNhac)) {
      return Response.json({ loi: 'Nhạc chỉ nhận mp3 / m4a / wav / aac' }, { status: 400 });
    }
  }

  if (voiceMode !== 'ai' && voiceMode !== 'upload') {
    return Response.json({ loi: 'Chế độ voice không hợp lệ' }, { status: 400 });
  }
  // Chế độ audio: link là TUỲ CHỌN (không link = hình tự sáng tác theo audio)
  if (voiceMode === 'upload' && !link) {
    link = '';
  } else if (!/^https?:\/\/\S+$/.test(link) || link.length > 2000) {
    return Response.json({ loi: 'Link không hợp lệ — dán link đầy đủ bắt đầu bằng https://' }, { status: 400 });
  }

  let audioExt = '';
  if (voiceMode === 'upload') {
    if (!audioFile || typeof audioFile === 'string' || !audioFile.size) {
      return Response.json({ loi: 'Chưa chọn file audio' }, { status: 400 });
    }
    if (audioFile.size > AUDIO_MAX) {
      return Response.json({ loi: 'File audio quá 20MB' }, { status: 400 });
    }
    audioExt = (audioFile.name.split('.').pop() || '').toLowerCase();
    if (!AUDIO_EXT.has(audioExt)) {
      return Response.json({ loi: 'Chỉ nhận mp3 / m4a / wav / aac / ogg' }, { status: 400 });
    }
    giong = ''; // dùng audio thì không cần giọng AI
  } else {
    if (!giong) giong = GIONG_MAC_DINH;
    if (!laGiongHopLe(giong)) return Response.json({ loi: 'Giọng đọc không hợp lệ' }, { status: 400 });
  }

  // Chặn dồn job: mỗi người tối đa 3 job đang chờ/chạy
  const dang = await q(
    `SELECT count(*)::int AS n FROM jobs WHERE user_id=$1 AND status IN ('queued','running')`,
    [u.id]
  );
  if (dang.rows[0].n >= 3) {
    return Response.json({ loi: 'Bạn đang có 3 video trong hàng đợi — chờ xong bớt rồi tạo tiếp' }, { status: 429 });
  }

  const r = await q(
    `INSERT INTO jobs (user_id, source_url, voice_mode, giong, audio_ext, nhac_nhom, bia_text, thi_truong)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
    [u.id, link, voiceMode, giong, audioExt, nhacNhom, biaText,
     ['vn', 'kh'].includes(thiTruong) ? thiTruong : 'vn']
  );
  const jobId = r.rows[0].id;

  // Lưu file đính kèm vào thư mục job TRƯỚC khi worker kịp lấy (worker poll 3s, ghi file là xong ngay)
  try {
    const dir = path.join(process.env.STORAGE_DIR, String(u.id), jobId);
    if (voiceMode === 'upload') {
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, `nguon-audio.${audioExt}`), Buffer.from(await audioFile.arrayBuffer()));
    }
    if (nhacNhom === 'upload') {
      fs.mkdirSync(dir, { recursive: true });
      const duoiNhac = (nhacFile.name.split('.').pop() || '').toLowerCase();
      fs.writeFileSync(path.join(dir, `nhac-rieng.${duoiNhac}`), Buffer.from(await nhacFile.arrayBuffer()));
    }
  } catch (e) {
    await q(`DELETE FROM jobs WHERE id=$1`, [jobId]);
    return Response.json({ loi: 'Không lưu được file đính kèm — thử lại' }, { status: 500 });
  }

  return Response.json({ ok: true, id: jobId });
}

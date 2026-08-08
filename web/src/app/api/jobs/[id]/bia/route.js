import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { q, docSettings } from '@/lib/db';
import { nguoiDung } from '@/lib/auth';

function chayPython(args, env, timeoutMs) {
  return new Promise((resolve) => {
    const p = spawn(process.env.PYTHON_BIN || '/opt/stickman/venv/bin/python3', args,
      { env: { ...process.env, ...env } });
    let err = '';
    p.stderr.on('data', (c) => { err += c.toString(); });
    const t = setTimeout(() => { p.kill('SIGKILL'); resolve({ ok: false, err: 'quá giờ' }); }, timeoutMs);
    p.on('close', (code) => { clearTimeout(t); resolve({ ok: code === 0, err }); });
    p.on('error', (e) => { clearTimeout(t); resolve({ ok: false, err: String(e) }); });
  });
}

// POST /api/jobs/:id/bia {trang, vang, anh, bia_dau} — trình thiết kế bìa:
// tạo lại thumbnail (0đ) + gắn/gỡ bìa đầu video theo bia_dau
export async function POST(req, { params }) {
  const u = await nguoiDung();
  if (!u) return Response.json({ loi: 'Chưa đăng nhập' }, { status: 401 });
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const trang = String(body.trang || '').trim().slice(0, 60);
  const vang = String(body.vang || '').trim().slice(0, 60);
  const anh = path.basename(String(body.anh || '').trim());
  const biaDau = body.bia_dau !== false;
  if (anh && !/^canh-\d+\.png$/.test(anh)) return Response.json({ loi: 'Ảnh nền không hợp lệ' }, { status: 400 });
  const chu = vang ? (trang ? `${trang} | ${vang}` : vang) : trang;
  if (!chu) return Response.json({ loi: 'Nhập ít nhất 1 dòng chữ' }, { status: 400 });

  const r = await q(
    `SELECT user_id FROM jobs
     WHERE id=$1 AND (user_id=$2 OR $3) AND status='done' AND NOT file_deleted AND NOT user_deleted`,
    [id, u.id, u.role === 'admin']
  );
  if (!r.rowCount) return Response.json({ loi: 'Video không còn file để làm bìa' }, { status: 404 });

  const dir = path.join(process.env.STORAGE_DIR, String(r.rows[0].user_id), id);
  if (!fs.existsSync(path.join(dir, 'anh'))) {
    return Response.json({ loi: 'Ảnh gốc đã bị dọn — không làm lại được bìa' }, { status: 410 });
  }

  const st = await docSettings();
  const scripts = path.join(process.env.PIPELINE_DIR, 'scripts');
  // 1) Vẽ lại bộ ảnh bìa (nhanh, ~2s)
  const b6 = await chayPython([path.join(scripts, 'b6-thumbnail.py'), dir, chu, anh],
    { CHU_MAU: st.chu_mau || 'FFD700', BRAND: st.brand || '' }, 60_000);
  if (!b6.ok) return Response.json({ loi: 'Vẽ ảnh bìa thất bại' }, { status: 500 });

  // 2) Gắn/gỡ bìa đầu video (re-encode, có thể ~30-60s)
  const b7 = await chayPython([path.join(scripts, 'b7-gan-bia.py'), dir, biaDau ? 'bat' : 'tat'],
    { FFMPEG_BIN: process.env.FFMPEG_BIN || 'ffmpeg' }, 180_000);
  if (!b7.ok) return Response.json({ loi: 'Ghép bìa vào video thất bại — ảnh bìa thì đã lưu' }, { status: 500 });

  const size = fs.existsSync(path.join(dir, 'final.mp4')) ? fs.statSync(path.join(dir, 'final.mp4')).size : 0;
  await q(`UPDATE jobs SET bia_text=$2, bia_anh=$3, bia_dau=$4, file_size=$5 WHERE id=$1`,
    [id, chu, anh, biaDau, size]);
  return Response.json({ ok: true });
}

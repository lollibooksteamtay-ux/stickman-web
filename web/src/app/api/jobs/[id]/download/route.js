import fs from 'fs';
import path from 'path';
import { Readable } from 'stream';
import { q } from '@/lib/db';
import { nguoiDung } from '@/lib/auth';

// GET /api/jobs/:id/download — trả file final.mp4 (chủ video hoặc admin)
export async function GET(req, { params }) {
  const u = await nguoiDung();
  if (!u) return Response.json({ loi: 'Chưa đăng nhập' }, { status: 401 });
  const { id } = await params;

  const r = await q(
    `SELECT j.*, u.id AS uid FROM jobs j JOIN users u ON u.id=j.user_id
     WHERE j.id=$1 AND (j.user_id=$2 OR $3)`,
    [id, u.id, u.role === 'admin']
  );
  const job = r.rows[0];
  if (!job) return Response.json({ loi: 'Không thấy video' }, { status: 404 });
  if (job.status !== 'done') return Response.json({ loi: 'Video chưa dựng xong' }, { status: 400 });
  if (job.file_deleted) return Response.json({ loi: 'Video đã hết hạn lưu (file bị xoá sau kỳ hạn)' }, { status: 410 });

  const file = path.join(process.env.STORAGE_DIR, String(job.user_id), job.id, 'final.mp4');
  if (!fs.existsSync(file)) {
    return Response.json({ loi: 'File không còn trên máy chủ' }, { status: 410 });
  }
  const size = fs.statSync(file).size;
  const tenTai = (job.title || 'video').replace(/[^\p{L}\p{N} _-]/gu, '').trim().slice(0, 80) || 'video';
  return new Response(Readable.toWeb(fs.createReadStream(file)), {
    headers: {
      'Content-Type': 'video/mp4',
      'Content-Length': String(size),
      'Content-Disposition': `attachment; filename="stickman.mp4"; filename*=UTF-8''${encodeURIComponent(tenTai)}.mp4`,
    },
  });
}

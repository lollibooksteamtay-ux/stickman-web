import fs from 'fs';
import path from 'path';
import { Readable } from 'stream';
import { q } from '@/lib/db';
import { nguoiDung } from '@/lib/auth';

// GET /api/jobs/:id/thumbnail — tải ảnh bìa 1080x1920 (có chữ tiêu đề)
export async function GET(req, { params }) {
  const u = await nguoiDung();
  if (!u) return new Response(null, { status: 401 });
  const { id } = await params;

  const r = await q(
    `SELECT user_id, title FROM jobs WHERE id=$1 AND (user_id=$2 OR $3)`,
    [id, u.id, u.role === 'admin']
  );
  const job = r.rows[0];
  if (!job) return new Response(null, { status: 404 });

  const file = path.join(process.env.STORAGE_DIR, String(job.user_id), id, 'thumbnail.jpg');
  if (!fs.existsSync(file)) {
    return Response.json({ loi: 'Video này chưa có ảnh bìa (tạo trước bản cập nhật)' }, { status: 404 });
  }
  const ten = (job.title || 'anh-bia').replace(/[^\p{L}\p{N} _-]/gu, '').trim().slice(0, 80) || 'anh-bia';
  return new Response(Readable.toWeb(fs.createReadStream(file)), {
    headers: {
      'Content-Type': 'image/jpeg',
      'Content-Length': String(fs.statSync(file).size),
      'Content-Disposition': `attachment; filename="anh-bia.jpg"; filename*=UTF-8''${encodeURIComponent(ten)}.jpg`,
    },
  });
}

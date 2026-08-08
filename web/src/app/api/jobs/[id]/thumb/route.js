import fs from 'fs';
import path from 'path';
import { Readable } from 'stream';
import { q } from '@/lib/db';
import { nguoiDung } from '@/lib/auth';

// GET /api/jobs/:id/thumb — ảnh thumbnail (giữ cả khi video hết hạn)
export async function GET(req, { params }) {
  const u = await nguoiDung();
  if (!u) return new Response(null, { status: 401 });
  const { id } = await params;

  const r = await q(
    `SELECT user_id FROM jobs WHERE id=$1 AND (user_id=$2 OR $3)`,
    [id, u.id, u.role === 'admin']
  );
  if (!r.rowCount) return new Response(null, { status: 404 });

  const file = path.join(process.env.STORAGE_DIR, String(r.rows[0].user_id), id, 'thumb.jpg');
  if (!fs.existsSync(file)) return new Response(null, { status: 404 });
  return new Response(Readable.toWeb(fs.createReadStream(file)), {
    headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, max-age=3600' },
  });
}

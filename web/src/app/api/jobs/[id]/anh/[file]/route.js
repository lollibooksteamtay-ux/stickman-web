import fs from 'fs';
import path from 'path';
import { Readable } from 'stream';
import { q } from '@/lib/db';
import { nguoiDung } from '@/lib/auth';

// GET /api/jobs/:id/anh/:file — xem 1 ảnh cảnh (dùng trong trình thiết kế bìa)
export async function GET(req, { params }) {
  const u = await nguoiDung();
  if (!u) return new Response(null, { status: 401 });
  const { id, file } = await params;
  const ten = path.basename(file);
  if (!/^canh-\d+\.png$/.test(ten)) return new Response(null, { status: 400 });

  const r = await q(
    `SELECT user_id FROM jobs WHERE id=$1 AND (user_id=$2 OR $3)`,
    [id, u.id, u.role === 'admin']
  );
  if (!r.rowCount) return new Response(null, { status: 404 });

  const dd = path.join(process.env.STORAGE_DIR, String(r.rows[0].user_id), id, 'anh', ten);
  if (!fs.existsSync(dd)) return new Response(null, { status: 404 });
  return new Response(Readable.toWeb(fs.createReadStream(dd)), {
    headers: { 'Content-Type': 'image/png', 'Cache-Control': 'private, max-age=3600' },
  });
}

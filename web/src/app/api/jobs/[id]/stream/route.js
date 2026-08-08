import fs from 'fs';
import path from 'path';
import { Readable } from 'stream';
import { q } from '@/lib/db';
import { nguoiDung } from '@/lib/auth';

// GET /api/jobs/:id/stream — phát video trong trình duyệt (hỗ trợ Range để tua)
export async function GET(req, { params }) {
  const u = await nguoiDung();
  if (!u) return new Response(null, { status: 401 });
  const { id } = await params;

  const r = await q(
    `SELECT user_id, status, file_deleted FROM jobs WHERE id=$1 AND (user_id=$2 OR $3)`,
    [id, u.id, u.role === 'admin']
  );
  const job = r.rows[0];
  if (!job || job.status !== 'done' || job.file_deleted) return new Response(null, { status: 404 });

  const file = path.join(process.env.STORAGE_DIR, String(job.user_id), id, 'final.mp4');
  if (!fs.existsSync(file)) return new Response(null, { status: 404 });
  const size = fs.statSync(file).size;

  const range = req.headers.get('range');
  if (range) {
    const m = range.match(/bytes=(\d*)-(\d*)/);
    let start = m && m[1] ? parseInt(m[1], 10) : 0;
    let end = m && m[2] ? parseInt(m[2], 10) : size - 1;
    if (isNaN(start) || start >= size) start = 0;
    if (isNaN(end) || end >= size) end = size - 1;
    return new Response(Readable.toWeb(fs.createReadStream(file, { start, end })), {
      status: 206,
      headers: {
        'Content-Type': 'video/mp4',
        'Content-Range': `bytes ${start}-${end}/${size}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': String(end - start + 1),
      },
    });
  }
  return new Response(Readable.toWeb(fs.createReadStream(file)), {
    headers: {
      'Content-Type': 'video/mp4',
      'Content-Length': String(size),
      'Accept-Ranges': 'bytes',
    },
  });
}

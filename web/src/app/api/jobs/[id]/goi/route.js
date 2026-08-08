import fs from 'fs';
import path from 'path';
import { ZipArchive } from 'archiver';
import { Readable } from 'stream';
import { q } from '@/lib/db';
import { nguoiDung } from '@/lib/auth';

// GET /api/jobs/:id/goi — tải 1 lần được CẢ GÓI: video + ảnh bìa (file .zip)
export async function GET(req, { params }) {
  const u = await nguoiDung();
  if (!u) return Response.json({ loi: 'Chưa đăng nhập' }, { status: 401 });
  const { id } = await params;

  const r = await q(
    `SELECT user_id, title, status, file_deleted FROM jobs
     WHERE id=$1 AND (user_id=$2 OR $3) AND NOT user_deleted`,
    [id, u.id, u.role === 'admin']
  );
  const job = r.rows[0];
  if (!job || job.status !== 'done' || job.file_deleted) {
    return Response.json({ loi: 'Video không còn file để tải' }, { status: 404 });
  }

  const dir = path.join(process.env.STORAGE_DIR, String(job.user_id), id);
  const video = path.join(dir, 'final.mp4');
  const bia = path.join(dir, 'thumbnail.jpg');
  if (!fs.existsSync(video)) return Response.json({ loi: 'Thiếu file video' }, { status: 410 });

  const ten = (job.title || 'video').replace(/[^\p{L}\p{N} _-]/gu, '').trim().slice(0, 60) || 'video';
  const zip = new ZipArchive({ zlib: { level: 1 } }); // nén nhẹ: mp4/jpg vốn đã nén sẵn
  zip.file(video, { name: `${ten}/video.mp4` });
  if (fs.existsSync(bia)) zip.file(bia, { name: `${ten}/anh-bia.jpg` });
  zip.finalize();

  return new Response(Readable.toWeb(zip), {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="stickman.zip"; filename*=UTF-8''${encodeURIComponent(ten)}.zip`,
    },
  });
}

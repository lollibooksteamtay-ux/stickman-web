import fs from 'fs';
import path from 'path';
import { q } from '@/lib/db';
import { nguoiDung } from '@/lib/auth';

// GET /api/jobs/:id/scenes — danh sách ảnh cảnh + cấu hình bìa hiện tại (cho trình thiết kế bìa)
export async function GET(req, { params }) {
  const u = await nguoiDung();
  if (!u) return Response.json({ loi: 'Chưa đăng nhập' }, { status: 401 });
  const { id } = await params;

  const r = await q(
    `SELECT user_id, title, bia_text, bia_anh, bia_dau FROM jobs
     WHERE id=$1 AND (user_id=$2 OR $3) AND NOT user_deleted`,
    [id, u.id, u.role === 'admin']
  );
  const job = r.rows[0];
  if (!job) return Response.json({ loi: 'Không thấy video' }, { status: 404 });

  const anhDir = path.join(process.env.STORAGE_DIR, String(job.user_id), id, 'anh');
  const scenes = fs.existsSync(anhDir)
    ? fs.readdirSync(anhDir).filter((f) => /^canh-\d+\.png$/.test(f)).sort()
    : [];
  return Response.json({
    scenes,
    title: job.title,
    bia_text: job.bia_text,
    bia_anh: job.bia_anh,
    bia_dau: job.bia_dau,
  });
}

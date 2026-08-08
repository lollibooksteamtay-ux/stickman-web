import { q } from '@/lib/db';
import { nguoiDung } from '@/lib/auth';

// POST /api/jobs/:id/retry — chạy lại job lỗi (giữ file đã làm được, worker tự bù phần thiếu)
export async function POST(req, { params }) {
  const u = await nguoiDung();
  if (!u) return Response.json({ loi: 'Chưa đăng nhập' }, { status: 401 });
  const { id } = await params;

  const r = await q(
    `UPDATE jobs SET status='queued', step=0, step_note='', error_text=''
     WHERE id=$1 AND status='error' AND (user_id=$2 OR $3)
     RETURNING id`,
    [id, u.id, u.role === 'admin']
  );
  if (!r.rowCount) {
    return Response.json({ loi: 'Không thấy video lỗi này' }, { status: 404 });
  }
  return Response.json({ ok: true });
}

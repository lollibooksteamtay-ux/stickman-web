import fs from 'fs';
import path from 'path';
import { q } from '@/lib/db';
import { nguoiDung } from '@/lib/auth';

// DELETE /api/jobs/:id — xoá video thủ công: xoá TOÀN BỘ file trên VPS,
// giữ dòng lịch sử (user_deleted=true) để trang Quản trị vẫn đếm đúng sản lượng.
export async function DELETE(req, { params }) {
  const u = await nguoiDung();
  if (!u) return Response.json({ loi: 'Chưa đăng nhập' }, { status: 401 });
  const { id } = await params;

  // Không xoá job đang dựng giữa chừng — tránh worker ghi file vào thư mục vừa xoá
  const r = await q(
    `UPDATE jobs SET user_deleted=true, file_deleted=true
     WHERE id=$1 AND (user_id=$2 OR $3) AND status <> 'running'
     RETURNING user_id`,
    [id, u.id, u.role === 'admin']
  );
  if (!r.rowCount) {
    return Response.json({ loi: 'Không xoá được — video đang dựng hoặc không tồn tại' }, { status: 409 });
  }
  const dir = path.join(process.env.STORAGE_DIR, String(r.rows[0].user_id), id);
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch { /* thư mục không còn cũng coi như xong */ }
  return Response.json({ ok: true });
}

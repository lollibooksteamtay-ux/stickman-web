import { q } from '@/lib/db';
import { nguoiDung } from '@/lib/auth';

const MOI_TRANG = 24;

// GET /api/admin/videos?user=all|<id>&days=30&page=1 — mọi video toàn hệ thống (quản trị)
export async function GET(req) {
  const u = await nguoiDung();
  if (!u || u.role !== 'admin') return Response.json({ loi: 'Chỉ quản trị viên' }, { status: 403 });

  const url = new URL(req.url);
  const userId = url.searchParams.get('user') || 'all';
  const days = Math.min(90, Math.max(1, parseInt(url.searchParams.get('days') || '30', 10)));
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));

  const dkUser = userId !== 'all' && /^\d+$/.test(userId) ? `AND j.user_id = ${Number(userId)}` : '';
  // Mặc định ẩn video đã xoá tay (file không còn, thumbnail cũng mất → hiện ra ô đen vô nghĩa)
  const dkXoa = url.searchParams.get('hien_xoa') === '1' ? '' : 'AND NOT j.user_deleted';
  const [ds, dem, users] = await Promise.all([
    q(`SELECT j.id, j.title, j.status, j.file_deleted, j.user_deleted, j.anh_tam, j.voice_mode,
              j.created_at, j.finished_at, u.name AS ten_nguoi, u.username
       FROM jobs j JOIN users u ON u.id = j.user_id
       WHERE j.created_at > now() - make_interval(days => $1) ${dkUser} ${dkXoa}
       ORDER BY j.created_at DESC LIMIT $2 OFFSET $3`,
      [days, MOI_TRANG, (page - 1) * MOI_TRANG]),
    q(`SELECT count(*)::int AS n FROM jobs j
       WHERE j.created_at > now() - make_interval(days => $1) ${dkUser} ${dkXoa}`, [days]),
    q(`SELECT id, username, name FROM users ORDER BY id`),
  ]);

  return Response.json({
    videos: ds.rows,
    tong: dem.rows[0].n,
    so_trang: Math.max(1, Math.ceil(dem.rows[0].n / MOI_TRANG)),
    page,
    users: users.rows,
  });
}

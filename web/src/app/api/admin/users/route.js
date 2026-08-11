import bcrypt from 'bcryptjs';
import { q } from '@/lib/db';
import { nguoiDung } from '@/lib/auth';

// POST /api/admin/users {username, name, pass} — tạo tài khoản mới
export async function POST(req) {
  const u = await nguoiDung();
  if (!u || u.role !== 'admin') return Response.json({ loi: 'Chỉ quản trị viên' }, { status: 403 });

  const { username, name, pass , thi_truong } = await req.json().catch(() => ({}));
  const tn = (username || '').trim().toLowerCase();
  if (!/^[a-z0-9_.-]{2,30}$/.test(tn)) {
    return Response.json({ loi: 'Tên đăng nhập: 2-30 ký tự, chỉ chữ thường/số/._-' }, { status: 400 });
  }
  if (!pass || pass.length < 6) return Response.json({ loi: 'Mật khẩu tối thiểu 6 ký tự' }, { status: 400 });

  const hash = await bcrypt.hash(pass, 10);
  try {
    const r = await q(
      `INSERT INTO users (username, name, pass_hash, thi_truong) VALUES ($1, $2, $3, $4) RETURNING id, username, name`,
      [tn, (name || '').trim(), hash, thi_truong === 'kh' ? 'kh' : 'vn']
    );
    return Response.json({ ok: true, user: r.rows[0] });
  } catch (e) {
    if (e.code === '23505') return Response.json({ loi: 'Tên đăng nhập này đã có' }, { status: 409 });
    throw e;
  }
}

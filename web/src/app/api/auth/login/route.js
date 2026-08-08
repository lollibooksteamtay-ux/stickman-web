import bcrypt from 'bcryptjs';
import { q } from '@/lib/db';
import { datCookieDangNhap } from '@/lib/auth';

export async function POST(req) {
  const { user, pass } = await req.json().catch(() => ({}));
  if (!user || !pass) {
    return Response.json({ loi: 'Thiếu tên đăng nhập hoặc mật khẩu' }, { status: 400 });
  }
  const r = await q('SELECT * FROM users WHERE lower(username)=lower($1)', [user.trim()]);
  const u = r.rows[0];
  // So sánh hash cả khi không có user — tránh lộ "tên tồn tại hay không" qua thời gian phản hồi
  const hash = u?.pass_hash || '$2b$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinva';
  const dung = await bcrypt.compare(pass, hash);
  if (!u || !dung) {
    return Response.json({ loi: 'Tên đăng nhập hoặc mật khẩu không đúng' }, { status: 401 });
  }
  if (u.status !== 'active') {
    return Response.json({ loi: 'Tài khoản đã bị khoá — liên hệ quản trị viên' }, { status: 403 });
  }
  await datCookieDangNhap(u);
  return Response.json({ ok: true, role: u.role });
}

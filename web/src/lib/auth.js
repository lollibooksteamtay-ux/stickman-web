import crypto from 'crypto';
import { cookies } from 'next/headers';
import { q } from './db';

const TEN_COOKIE = 'stickman_sess';
const HAN_GIAY = 60 * 60 * 24 * 14; // 14 ngày

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 16) throw new Error('SESSION_SECRET chưa cấu hình');
  return s;
}

function ky(payload) {
  return crypto.createHmac('sha256', secret()).update(payload).digest('base64url');
}

export function taoToken(user) {
  const payload = Buffer.from(
    JSON.stringify({ uid: user.id, role: user.role, exp: Date.now() + HAN_GIAY * 1000 })
  ).toString('base64url');
  return `${payload}.${ky(payload)}`;
}

export function docToken(token) {
  if (!token) return null;
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;
  try {
    const sigDung = ky(payload);
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(sigDung))) return null;
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (data.exp < Date.now()) return null;
    return data;
  } catch {
    return null;
  }
}

// Dùng trong API route / server component: trả {uid, role} hoặc null
export async function nguoiDung() {
  const store = await cookies();
  const tk = docToken(store.get(TEN_COOKIE)?.value);
  if (!tk) return null;
  // Kiểm tra tài khoản còn hoạt động (bị khoá là văng ngay, không chờ cookie hết hạn)
  const r = await q('SELECT id, username, email, name, role, status FROM users WHERE id=$1', [tk.uid]);
  const u = r.rows[0];
  if (!u || u.status !== 'active') return null;
  return u;
}

export async function datCookieDangNhap(user) {
  const store = await cookies();
  store.set(TEN_COOKIE, taoToken(user), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: HAN_GIAY,
    path: '/',
  });
}

export async function xoaCookieDangNhap() {
  const store = await cookies();
  store.set(TEN_COOKIE, '', { httpOnly: true, maxAge: 0, path: '/' });
}

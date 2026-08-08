import { xoaCookieDangNhap } from '@/lib/auth';

export async function POST() {
  await xoaCookieDangNhap();
  return Response.json({ ok: true });
}

import { nguoiDung } from '@/lib/auth';

export async function GET() {
  const u = await nguoiDung();
  if (!u) return Response.json({ loi: 'Chưa đăng nhập' }, { status: 401 });
  return Response.json({ id: u.id, username: u.username, name: u.name, role: u.role });
}

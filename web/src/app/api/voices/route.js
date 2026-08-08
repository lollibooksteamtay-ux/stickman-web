import { GIONG_DOC } from '@/lib/voices';
import { nguoiDung } from '@/lib/auth';

export async function GET() {
  const u = await nguoiDung();
  if (!u) return Response.json({ loi: 'Chưa đăng nhập' }, { status: 401 });
  return Response.json({ giong: GIONG_DOC });
}

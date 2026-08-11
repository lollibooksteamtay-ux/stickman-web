import { dsGiongTheoThiTruong } from '@/lib/voices';
import { nguoiDung } from '@/lib/auth';

export async function GET(req) {
  const u = await nguoiDung();
  if (!u) return Response.json({ loi: 'Chưa đăng nhập' }, { status: 401 });
  const tt = new URL(req.url).searchParams.get('tt') || u.thi_truong || 'vn';
  return Response.json({ giong: dsGiongTheoThiTruong(tt) });
}

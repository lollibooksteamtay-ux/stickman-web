import fs from 'fs';
import path from 'path';
import { Readable } from 'stream';
import { nguoiDung } from '@/lib/auth';

// GET /api/admin/characters/anh?ten=xxx.png — xem ảnh nhân vật trong trang Quản trị
export async function GET(req) {
  const u = await nguoiDung();
  if (!u || u.role !== 'admin') return new Response(null, { status: 403 });
  const ten = path.basename(new URL(req.url).searchParams.get('ten') || '');
  if (!/\.(png|jpe?g|webp)$/i.test(ten)) return new Response(null, { status: 400 });

  const dd = path.join(process.env.PIPELINE_DIR || '/opt/stickman/pipeline', 'assets', 'nhan-vat', ten);
  if (!fs.existsSync(dd)) return new Response(null, { status: 404 });
  return new Response(Readable.toWeb(fs.createReadStream(dd)), {
    headers: { 'Content-Type': 'image/png', 'Cache-Control': 'private, max-age=60' },
  });
}

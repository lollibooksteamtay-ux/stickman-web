import fs from 'fs';
import path from 'path';
import { Readable } from 'stream';
import { nguoiDung } from '@/lib/auth';
import { NHOM_CO_THU_MUC } from '@/lib/nhac';

const MIME = { mp3: 'audio/mpeg', m4a: 'audio/mp4', wav: 'audio/wav', aac: 'audio/aac' };

// GET ?nhom=&file= — nghe thử 1 bài trong kho (admin)
export async function GET(req) {
  const u = await nguoiDung();
  if (!u || u.role !== 'admin') return new Response(null, { status: 403 });
  const url = new URL(req.url);
  const nhom = url.searchParams.get('nhom') || 'goc';
  const file = path.basename(url.searchParams.get('file') || '');
  if (nhom !== 'goc' && !NHOM_CO_THU_MUC.some((n) => n.id === nhom)) return new Response(null, { status: 400 });
  const kho = path.join(process.env.PIPELINE_DIR || '/opt/stickman/pipeline', 'assets', 'nhac');
  const dd = nhom === 'goc' ? path.join(kho, file) : path.join(kho, nhom, file);
  if (!file || !fs.existsSync(dd)) return new Response(null, { status: 404 });
  const duoi = file.split('.').pop().toLowerCase();
  return new Response(Readable.toWeb(fs.createReadStream(dd)), {
    headers: {
      'Content-Type': MIME[duoi] || 'audio/mpeg',
      'Content-Length': String(fs.statSync(dd).size),
      'Cache-Control': 'private, max-age=60',
    },
  });
}

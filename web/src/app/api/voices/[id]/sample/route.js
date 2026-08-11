import fs from 'fs';
import path from 'path';
import { Readable } from 'stream';
import { nguoiDung } from '@/lib/auth';
import { laGiongHopLe } from '@/lib/voices';

// GET /api/voices/:id/sample — file mp3 nghe thử (sinh sẵn ở pipeline/assets/voices/)
export async function GET(req, { params }) {
  const u = await nguoiDung();
  if (!u) return new Response(null, { status: 401 });
  const { id } = await params;
  if (!laGiongHopLe(id)) return new Response(null, { status: 404 });

  const tt = new URL(req.url).searchParams.get('tt') === 'kh' ? 'kh-' : '';
  const file = path.join(process.env.PIPELINE_DIR || '/opt/stickman/pipeline', 'assets', 'voices', `${tt}${id}.mp3`);
  if (!fs.existsSync(file)) return new Response(null, { status: 404 });
  return new Response(Readable.toWeb(fs.createReadStream(file)), {
    headers: { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'private, max-age=300' },
  });
}

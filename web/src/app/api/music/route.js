import fs from 'fs';
import path from 'path';
import { nguoiDung } from '@/lib/auth';
import { NHOM_CO_THU_MUC } from '@/lib/nhac';

const DUOI = new Set(['mp3', 'm4a', 'wav', 'aac']);

// GET /api/music — kho nhạc cho MỌI người dùng xem (chọn bài khi tạo video)
export async function GET() {
  const u = await nguoiDung();
  if (!u) return Response.json({ loi: 'Chưa đăng nhập' }, { status: 401 });
  const kho = path.join(process.env.PIPELINE_DIR || '/opt/stickman/pipeline', 'assets', 'nhac');
  const kq = [];
  for (const nhom of ['goc', ...NHOM_CO_THU_MUC.map((n) => n.id)]) {
    const dir = nhom === 'goc' ? kho : path.join(kho, nhom);
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
      if (f.isFile() && DUOI.has(f.name.split('.').pop().toLowerCase())) {
        kq.push({ nhom, name: f.name });
      }
    }
  }
  return Response.json({ bai: kq });
}

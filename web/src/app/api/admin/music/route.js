import fs from 'fs';
import path from 'path';
import { nguoiDung } from '@/lib/auth';
import { NHOM_CO_THU_MUC } from '@/lib/nhac';

const DUOI = new Set(['mp3', 'm4a', 'wav', 'aac']);
const MAX = 15 * 1024 * 1024;

function khoNhac() {
  return path.join(process.env.PIPELINE_DIR || '/opt/stickman/pipeline', 'assets', 'nhac');
}
function nhomHopLe(nhom) {
  return nhom === 'goc' || NHOM_CO_THU_MUC.some((n) => n.id === nhom);
}
function duongDanNhom(nhom) {
  return nhom === 'goc' ? khoNhac() : path.join(khoNhac(), nhom);
}

// GET — liệt kê nhạc theo nhóm ('goc' = chưa phân nhóm, nằm ngay gốc kho)
export async function GET() {
  const u = await nguoiDung();
  if (!u || u.role !== 'admin') return Response.json({ loi: 'Chỉ quản trị viên' }, { status: 403 });
  const kq = {};
  for (const nhom of ['goc', ...NHOM_CO_THU_MUC.map((n) => n.id)]) {
    const dir = duongDanNhom(nhom);
    kq[nhom] = fs.existsSync(dir)
      ? fs.readdirSync(dir, { withFileTypes: true })
          .filter((f) => f.isFile() && DUOI.has(f.name.split('.').pop().toLowerCase()))
          .map((f) => ({ name: f.name, size: fs.statSync(path.join(dir, f.name)).size }))
      : [];
  }
  return Response.json({ nhac: kq });
}

// POST multipart {nhom, file} — tải nhạc lên
export async function POST(req) {
  const u = await nguoiDung();
  if (!u || u.role !== 'admin') return Response.json({ loi: 'Chỉ quản trị viên' }, { status: 403 });
  const fd = await req.formData().catch(() => null);
  if (!fd) return Response.json({ loi: 'Dữ liệu hỏng' }, { status: 400 });
  const nhom = String(fd.get('nhom') || 'goc');
  const file = fd.get('file');
  if (!nhomHopLe(nhom)) return Response.json({ loi: 'Nhóm không hợp lệ' }, { status: 400 });
  if (!file || typeof file === 'string' || !file.size) return Response.json({ loi: 'Chưa chọn file' }, { status: 400 });
  if (file.size > MAX) return Response.json({ loi: 'File quá 15MB' }, { status: 400 });
  const duoi = (file.name.split('.').pop() || '').toLowerCase();
  if (!DUOI.has(duoi)) return Response.json({ loi: 'Chỉ nhận mp3 / m4a / wav / aac' }, { status: 400 });

  // Tên file an toàn: bỏ ký tự lạ, chống ghi đè đường dẫn
  const ten = path.basename(file.name).replace(/[^\p{L}\p{N} ._-]/gu, '').slice(0, 80) || `nhac-${Date.now()}.${duoi}`;
  const dir = duongDanNhom(nhom);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, ten), Buffer.from(await file.arrayBuffer()));
  return Response.json({ ok: true, ten });
}

// DELETE ?nhom=&file= — xoá 1 bài
export async function DELETE(req) {
  const u = await nguoiDung();
  if (!u || u.role !== 'admin') return Response.json({ loi: 'Chỉ quản trị viên' }, { status: 403 });
  const url = new URL(req.url);
  const nhom = url.searchParams.get('nhom') || 'goc';
  const file = path.basename(url.searchParams.get('file') || '');
  if (!nhomHopLe(nhom) || !file) return Response.json({ loi: 'Thiếu thông tin' }, { status: 400 });
  const dd = path.join(duongDanNhom(nhom), file);
  if (!fs.existsSync(dd)) return Response.json({ loi: 'Không thấy file' }, { status: 404 });
  fs.rmSync(dd);
  return Response.json({ ok: true });
}

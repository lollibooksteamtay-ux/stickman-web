import fs from 'fs';
import path from 'path';
import { nguoiDung } from '@/lib/auth';

const DUOI = new Set(['png', 'jpg', 'jpeg', 'webp']);
const MAX = 8 * 1024 * 1024;

function thuMuc() {
  const d = path.join(process.env.PIPELINE_DIR || '/opt/stickman/pipeline', 'assets', 'nhan-vat');
  fs.mkdirSync(d, { recursive: true });
  return d;
}

function slug(s) {
  return String(s).toLowerCase().trim()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
}

// GET — danh sách nhân vật trong đoàn
export async function GET() {
  const u = await nguoiDung();
  if (!u || u.role !== 'admin') return Response.json({ loi: 'Chỉ quản trị viên' }, { status: 403 });
  const d = thuMuc();
  const ds = fs.readdirSync(d)
    .filter((f) => DUOI.has(f.split('.').pop().toLowerCase()))
    .map((f) => ({ ten: f, kb: Math.round(fs.statSync(path.join(d, f)).size / 1024) }))
    .sort((a, b) => a.ten.localeCompare(b.ten));
  return Response.json({ nhan_vat: ds });
}

// POST multipart {ten, file} — tải ảnh nhân vật lên (anh Tây tự vẽ free ở AI Studio rồi nạp vào)
export async function POST(req) {
  const u = await nguoiDung();
  if (!u || u.role !== 'admin') return Response.json({ loi: 'Chỉ quản trị viên' }, { status: 403 });

  const fd = await req.formData().catch(() => null);
  if (!fd) return Response.json({ loi: 'Dữ liệu gửi lên hỏng' }, { status: 400 });
  const f = fd.get('file');
  const ten = slug(fd.get('ten') || '');
  if (!ten) return Response.json({ loi: 'Nhập tên nhân vật (vd: nam-trung-nien)' }, { status: 400 });
  if (!f || typeof f === 'string' || !f.size) return Response.json({ loi: 'Chưa chọn ảnh' }, { status: 400 });
  if (f.size > MAX) return Response.json({ loi: 'Ảnh quá 8MB' }, { status: 400 });
  const duoi = (f.name.split('.').pop() || '').toLowerCase();
  if (!DUOI.has(duoi)) return Response.json({ loi: 'Chỉ nhận png / jpg / webp' }, { status: 400 });

  // Luôn lưu đuôi .png để pipeline chỉ cần tìm 1 kiểu
  const dd = path.join(thuMuc(), `${ten}.png`);
  fs.writeFileSync(dd, Buffer.from(await f.arrayBuffer()));
  return Response.json({ ok: true, ten: `${ten}.png` });
}

// DELETE ?ten=xxx.png
export async function DELETE(req) {
  const u = await nguoiDung();
  if (!u || u.role !== 'admin') return Response.json({ loi: 'Chỉ quản trị viên' }, { status: 403 });
  const ten = path.basename(new URL(req.url).searchParams.get('ten') || '');
  const dd = path.join(thuMuc(), ten);
  if (!ten || !fs.existsSync(dd)) return Response.json({ loi: 'Không thấy nhân vật' }, { status: 404 });
  fs.rmSync(dd);
  return Response.json({ ok: true });
}

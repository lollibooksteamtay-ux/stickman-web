import bcrypt from 'bcryptjs';
import { q } from '@/lib/db';
import { nguoiDung } from '@/lib/auth';

const TZ = 'Asia/Ho_Chi_Minh';

// GET /api/admin/users/:id?month=2026-08 — trang chi tiết 1 người dùng
export async function GET(req, { params }) {
  const u = await nguoiDung();
  if (!u || u.role !== 'admin') return Response.json({ loi: 'Chỉ quản trị viên' }, { status: 403 });
  const { id } = await params;

  const url = new URL(req.url);
  // month dạng YYYY-MM; mặc định tháng hiện tại theo giờ VN
  const month = /^\d{4}-\d{2}$/.test(url.searchParams.get('month') || '')
    ? url.searchParams.get('month')
    : null;
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
  const MOI_TRANG = 20;

  const mocThang = month
    ? `date_trunc('month', to_date('${month}', 'YYYY-MM'))`
    : `date_trunc('month', now() AT TIME ZONE '${TZ}')`;
  const dkThang = `date_trunc('month', j.created_at AT TIME ZONE '${TZ}') = ${mocThang}`;

  const [nguoi, tongHop, theoNgay, ds, thangCo] = await Promise.all([
    q('SELECT id, username, name, role, status, created_at FROM users WHERE id=$1', [id]),
    q(`SELECT count(*)::int AS tong,
         count(*) FILTER (WHERE j.status='done')::int AS xong,
         count(*) FILTER (WHERE j.status='error')::int AS loi
       FROM jobs j WHERE j.user_id=$1 AND ${dkThang}`, [id]),
    q(`SELECT extract(day FROM (j.created_at AT TIME ZONE '${TZ}'))::int AS ngay, count(*)::int AS n
       FROM jobs j WHERE j.user_id=$1 AND ${dkThang}
       GROUP BY 1 ORDER BY 1`, [id]),
    q(`SELECT j.id, j.title, j.status, j.step, j.error_text, j.file_deleted, j.user_deleted, j.created_at, j.finished_at
       FROM jobs j WHERE j.user_id=$1 AND ${dkThang}
       ORDER BY j.created_at DESC LIMIT ${MOI_TRANG} OFFSET ${(page - 1) * MOI_TRANG}`, [id]),
    q(`SELECT DISTINCT to_char(j.created_at AT TIME ZONE '${TZ}', 'YYYY-MM') AS thang
       FROM jobs j WHERE j.user_id=$1 ORDER BY 1 DESC`, [id]),
  ]);

  if (!nguoi.rowCount) return Response.json({ loi: 'Không thấy người dùng' }, { status: 404 });
  const th = tongHop.rows[0];
  return Response.json({
    user: nguoi.rows[0],
    thang: month || new Date().toISOString().slice(0, 7),
    cac_thang: thangCo.rows.map((x) => x.thang),
    tong_hop: th,
    theo_ngay: theoNgay.rows,
    jobs: ds.rows,
    page,
    so_trang: Math.max(1, Math.ceil(th.tong / MOI_TRANG)),
  });
}

// PATCH /api/admin/users/:id {action: 'lock'|'unlock'|'reset_pass', pass?}
export async function PATCH(req, { params }) {
  const u = await nguoiDung();
  if (!u || u.role !== 'admin') return Response.json({ loi: 'Chỉ quản trị viên' }, { status: 403 });
  const { id } = await params;
  const { action, pass, thi_truong } = await req.json().catch(() => ({}));

  if (Number(id) === u.id && action === 'lock') {
    return Response.json({ loi: 'Không tự khoá tài khoản của chính mình' }, { status: 400 });
  }
  if (action === 'thi_truong') {
    const tt = thi_truong === 'kh' ? 'kh' : 'vn';
    await q(`UPDATE users SET thi_truong=$2 WHERE id=$1`, [id, tt]);
    return Response.json({ ok: true, thi_truong: tt });
  }
  if (action === 'lock' || action === 'unlock') {
    await q(`UPDATE users SET status=$2 WHERE id=$1`, [id, action === 'lock' ? 'locked' : 'active']);
    return Response.json({ ok: true });
  }
  if (action === 'reset_pass') {
    if (!pass || pass.length < 6) return Response.json({ loi: 'Mật khẩu tối thiểu 6 ký tự' }, { status: 400 });
    const hash = await bcrypt.hash(pass, 10);
    await q(`UPDATE users SET pass_hash=$2 WHERE id=$1`, [id, hash]);
    return Response.json({ ok: true });
  }
  return Response.json({ loi: 'Hành động không hợp lệ' }, { status: 400 });
}

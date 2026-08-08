import { q, docSettings } from '@/lib/db';
import { nguoiDung } from '@/lib/auth';

const TZ = 'Asia/Ho_Chi_Minh';

// GET /api/admin/stats?days=7|30 — số liệu toàn hệ thống cho quản trị viên
export async function GET(req) {
  const u = await nguoiDung();
  if (!u || u.role !== 'admin') return Response.json({ loi: 'Chỉ quản trị viên' }, { status: 403 });

  const url = new URL(req.url);
  const days = Math.min(90, Math.max(1, parseInt(url.searchParams.get('days') || '7', 10)));

  const [tongQuan, theoNgay, theoUser, st] = await Promise.all([
    q(`SELECT
         count(*) FILTER (WHERE (created_at AT TIME ZONE '${TZ}')::date = (now() AT TIME ZONE '${TZ}')::date)::int AS hom_nay,
         count(*) FILTER (WHERE (created_at AT TIME ZONE '${TZ}')::date = (now() AT TIME ZONE '${TZ}')::date - 1)::int AS hom_qua,
         count(*) FILTER (WHERE created_at > now() - make_interval(days => $1))::int AS trong_ky,
         (SELECT count(DISTINCT user_id) FROM jobs
           WHERE (created_at AT TIME ZONE '${TZ}')::date = (now() AT TIME ZONE '${TZ}')::date)::int AS user_hom_nay,
         (SELECT count(*) FROM users WHERE status='active')::int AS user_tong,
         (SELECT coalesce(sum(scenes + 1), 0) FROM jobs
           WHERE NOT anh_tam AND scenes > 0
             AND created_at > now() - make_interval(days => $1))::int AS anh_trong_ky
       FROM jobs`, [days]),
    q(`SELECT (created_at AT TIME ZONE '${TZ}')::date AS ngay, count(*)::int AS n
       FROM jobs WHERE created_at > now() - make_interval(days => $1)
       GROUP BY 1 ORDER BY 1`, [days]),
    q(`SELECT u.id, u.username, u.name, u.status,
         count(j.id) FILTER (WHERE (j.created_at AT TIME ZONE '${TZ}')::date = (now() AT TIME ZONE '${TZ}')::date)::int AS hom_nay,
         count(j.id) FILTER (WHERE j.created_at > now() - make_interval(days => $1))::int AS trong_ky,
         count(j.id) FILTER (WHERE j.status='error' AND j.created_at > now() - make_interval(days => $1))::int AS loi,
         max(j.created_at) AS lan_cuoi
       FROM users u LEFT JOIN jobs j ON j.user_id = u.id
       GROUP BY u.id ORDER BY trong_ky DESC, u.id`, [days]),
    docSettings(),
  ]);

  const t = tongQuan.rows[0];
  return Response.json({
    tong_quan: t,
    theo_ngay: theoNgay.rows,
    theo_user: theoUser.rows,
    days,
    key_anh_da_cam: Boolean(st.gemini_key_image),
    key_text_da_cam: Boolean(st.gemini_key_text),
  });
}

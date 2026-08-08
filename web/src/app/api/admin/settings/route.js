import { q, docSettings } from '@/lib/db';
import { nguoiDung } from '@/lib/auth';

// Key API chỉ trả về dạng che (4 ký tự cuối) — không bao giờ lộ nguyên key ra trình duyệt
function che(v) {
  if (!v) return '';
  return `••••${v.slice(-4)}`;
}

const CHO_PHEP = new Set([
  'gemini_key_text', 'gemini_key_image', 'gemini_keys_free', 'mock_anh', 'retention_days',
  'cost_per_video', 'giong_doc', 'phong_cach_doc', 'brand', 'nhac_vol',
  'model_phan_tich', 'model_anh', 'model_tts', 'nen_mau', 'net_mau', 'chu_mau',
]);

export async function GET() {
  const u = await nguoiDung();
  if (!u || u.role !== 'admin') return Response.json({ loi: 'Chỉ quản trị viên' }, { status: 403 });
  const st = await docSettings();
  return Response.json({
    ...Object.fromEntries(Object.entries(st).filter(([k]) => CHO_PHEP.has(k))),
    gemini_key_text: che(st.gemini_key_text),
    gemini_key_image: che(st.gemini_key_image),
    // Kho key free: chỉ trả SỐ LƯỢNG + 4 số cuối từng key, không bao giờ trả key thật
    keys_free: String(st.gemini_keys_free || '')
      .split(/[\n,;\s]+/).map((x) => x.trim()).filter((x) => x.length > 20)
      .map((k, i) => ({ so: i + 1, cuoi: k.slice(-4) })),
  });
}

// POST {key: value, ...} — cập nhật cấu hình; key rỗng nghĩa là "giữ nguyên" với 2 ô key API
export async function POST(req) {
  const u = await nguoiDung();
  if (!u || u.role !== 'admin') return Response.json({ loi: 'Chỉ quản trị viên' }, { status: 403 });
  const body = await req.json().catch(() => ({}));

  for (const [k, v] of Object.entries(body)) {
    if (!CHO_PHEP.has(k)) continue;
    const val = String(v ?? '').trim();
    // Không ghi đè key API bằng chuỗi che hoặc rỗng gửi nhầm
    if ((k === 'gemini_key_text' || k === 'gemini_key_image') && (val === '' || val.startsWith('••••'))) continue;
    // Kho key free: cho phép ghi rỗng (= xoá hết kho), nhưng lọc rác + chuẩn hoá mỗi dòng 1 key
    if (k === 'gemini_keys_free') {
      const sach = val.split(/[\n,;\s]+/).map((x) => x.trim())
        .filter((x) => x.length > 20 && !x.startsWith('••••'));
      await q(`INSERT INTO settings(key, value) VALUES ($1,$2)
               ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value`, [k, sach.join('\n')]);
      continue;
    }
    await q(
      `INSERT INTO settings(key, value) VALUES ($1,$2)
       ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value`,
      [k, val]
    );
  }
  return Response.json({ ok: true });
}

'use client';
import { useCallback, useEffect, useState } from 'react';
import Shell from '../shell';

function ngayNgan(s) {
  const d = new Date(s);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function gioGan(s) {
  if (!s) return '—';
  const d = new Date(s);
  const homNay = new Date().toDateString() === d.toDateString();
  const hhmm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  return homNay ? hhmm : `${ngayNgan(s)} ${hhmm}`;
}
const TEN_NHOM = {
  goc: '📂 Chưa phân nhóm', 'vui-tuoi': '😄 Vui tươi', 'tram-buon': '🌙 Trầm lắng',
  'hao-hung': '🔥 Hào hùng', 'cang-thang': '⚡ Căng thẳng / kịch tính',
};

function KhoNhac({ bao }) {
  const [nhac, setNhac] = useState(null);
  const [nhom, setNhom] = useState('vui-tuoi');
  const [file, setFile] = useState(null);
  const [dangTai, setDangTai] = useState(false);

  const tai = useCallback(async () => {
    const r = await fetch('/api/admin/music');
    if (r.ok) setNhac((await r.json()).nhac);
  }, []);
  useEffect(() => { tai(); }, [tai]);

  async function taiLen(e) {
    e.preventDefault();
    if (!file) return;
    setDangTai(true);
    const fd = new FormData();
    fd.set('nhom', nhom);
    fd.set('file', file);
    const r = await fetch('/api/admin/music', { method: 'POST', body: fd });
    const d = await r.json();
    setDangTai(false);
    if (!r.ok) { bao('loi', d.loi); return; }
    bao('ok', `Đã thêm "${d.ten}" vào nhóm`);
    setFile(null);
    e.target.reset?.();
    tai();
  }

  async function xoa(nhomId, ten) {
    if (!window.confirm(`Xoá bài "${ten}" khỏi kho?`)) return;
    const r = await fetch(`/api/admin/music?nhom=${nhomId}&file=${encodeURIComponent(ten)}`, { method: 'DELETE' });
    if (r.ok) { bao('ok', 'Đã xoá'); tai(); }
  }

  return (
    <div className="panel">
      <h3 id="kho-nhac">🎵 Kho nhạc nền <span className="dim" style={{ fontWeight: 400 }}>— người dùng chọn nhóm khi tạo video, hệ thống lấy ngẫu nhiên 1 bài trong nhóm</span></h3>
      <form className="form-dong" onSubmit={taiLen} style={{ marginBottom: 12 }}>
        <input type="file" accept=".mp3,.m4a,.wav,.aac,audio/*" onChange={(e) => setFile(e.target.files?.[0] || null)} />
        <select className="chon" value={nhom} onChange={(e) => setNhom(e.target.value)}>
          {Object.entries(TEN_NHOM).filter(([k]) => k !== 'goc').map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <button className="btn-sm chinh" disabled={!file || dangTai}>{dangTai ? 'Đang tải…' : '⬆ Tải nhạc lên'}</button>
      </form>
      {nhac && Object.entries(nhac).map(([k, files]) => (
        (files.length > 0 || k !== 'goc') && (
          <div key={k} style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 5 }}>
              {TEN_NHOM[k]} <span className="dim">({files.length} bài)</span>
            </div>
            {files.map((f) => (
              <div key={f.name} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 0', fontSize: 12.5 }}>
                <audio controls preload="none" style={{ height: 28, maxWidth: 220 }}
                  src={`/api/admin/music/play?nhom=${k}&file=${encodeURIComponent(f.name)}`} />
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                <span className="dim">{(f.size / 1e6).toFixed(1)}MB</span>
                <button className="btn-sm nguy" onClick={() => xoa(k, f.name)}>Xoá</button>
              </div>
            ))}
            {!files.length && <div className="dim" style={{ fontSize: 12 }}>— trống —</div>}
          </div>
        )
      ))}
    </div>
  );
}

function DoanNhanVat({ bao }) {
  const [ds, setDs] = useState([]);
  const [ten, setTen] = useState('');
  const [file, setFile] = useState(null);
  const [dangTai, setDangTai] = useState(false);

  const tai = useCallback(async () => {
    const r = await fetch('/api/admin/characters');
    if (r.ok) setDs((await r.json()).nhan_vat || []);
  }, []);
  useEffect(() => { tai(); }, [tai]);

  async function taiLen(e) {
    e.preventDefault();
    if (!file || !ten.trim()) return;
    setDangTai(true);
    const fd = new FormData();
    fd.set('ten', ten);
    fd.set('file', file);
    const r = await fetch('/api/admin/characters', { method: 'POST', body: fd });
    const d = await r.json();
    setDangTai(false);
    if (!r.ok) { bao('loi', d.loi); return; }
    bao('ok', `Đã nạp nhân vật ${d.ten}`);
    setTen(''); setFile(null);
    e.target.reset?.();
    tai();
  }

  async function xoa(t) {
    if (!window.confirm(`Xoá nhân vật ${t}?`)) return;
    const r = await fetch(`/api/admin/characters?ten=${encodeURIComponent(t)}`, { method: 'DELETE' });
    if (r.ok) { bao('ok', 'Đã xoá'); tai(); }
  }

  return (
    <div className="panel">
      <h3 id="nhan-vat">👥 Đoàn nhân vật cố định
        <span className="dim" style={{ fontWeight: 400 }}>— dùng làm mẫu cho mọi video, nhân vật giống nhau cả kênh</span>
      </h3>
      <div className="thongbao chuy" style={{ fontSize: 12 }}>
        Vẽ <b>miễn phí</b> ở <a href="https://aistudio.google.com" target="_blank" rel="noreferrer" style={{ color: 'var(--xanh)', fontWeight: 700 }}>aistudio.google.com</a> (giao diện web không tính tiền như API),
        vẽ tới lúc ưng mắt rồi tải ảnh lên đây. Hệ thống sẽ đính ảnh này làm mẫu khi vẽ từng cảnh.
      </div>
      <form className="form-dong" onSubmit={taiLen} style={{ marginBottom: 12 }}>
        <input placeholder="tên nhân vật (vd: nam-trung-nien)" value={ten}
          onChange={(e) => setTen(e.target.value)} style={{ minWidth: 220 }} />
        <input type="file" accept=".png,.jpg,.jpeg,.webp,image/*"
          onChange={(e) => setFile(e.target.files?.[0] || null)} />
        <button className="btn-sm chinh" disabled={!file || !ten.trim() || dangTai}>
          {dangTai ? 'Đang nạp…' : '⬆ Nạp nhân vật'}
        </button>
      </form>
      {ds.length ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(120px,1fr))', gap: 10 }}>
          {ds.map((n) => (
            <div key={n.ten} style={{ border: '1px solid var(--vien)', borderRadius: 10, overflow: 'hidden', background: '#000' }}>
              <img src={`/api/admin/characters/anh?ten=${encodeURIComponent(n.ten)}`} alt={n.ten}
                style={{ width: '100%', aspectRatio: '9/14', objectFit: 'contain', display: 'block' }} />
              <div style={{ padding: '6px 8px', background: '#fff' }}>
                <div style={{ fontSize: 11, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {n.ten.replace(/\.png$/, '')}
                </div>
                <div className="dim" style={{ fontSize: 10 }}>{n.kb} KB</div>
                <button className="btn-sm nguy" style={{ marginTop: 5, height: 24, fontSize: 11, width: '100%' }}
                  onClick={() => xoa(n.ten)}>Xoá</button>
              </div>
            </div>
          ))}
        </div>
      ) : <div className="dim" style={{ fontSize: 12.5 }}>— chưa có nhân vật nào, nạp ảnh đầu tiên phía trên —</div>}
    </div>
  );
}

export default function TrangQuanTri() {
  const [me, setMe] = useState(null);
  const [data, setData] = useState(null);
  const [days, setDays] = useState(7);
  const [st, setSt] = useState(null);
  const [tb, setTb] = useState(null); // {loai, chu}
  const [formUser, setFormUser] = useState({ username: '', name: '', pass: '', thi_truong: 'vn' });
  const [keyAnh, setKeyAnh] = useState('');
  const [keyText, setKeyText] = useState('');
  const [keysFree, setKeysFree] = useState('');

  const tai = useCallback(async (d = days) => {
    const [r1, r2] = await Promise.all([
      fetch(`/api/admin/stats?days=${d}`),
      fetch('/api/admin/settings'),
    ]);
    if (r1.status === 401 || r1.status === 403) { window.location.href = '/'; return; }
    setData(await r1.json());
    setSt(await r2.json());
  }, [days]);

  useEffect(() => {
    fetch('/api/me').then(async (r) => {
      if (r.status === 401) { window.location.href = '/login'; return; }
      const m = await r.json();
      if (m.role !== 'admin') { window.location.href = '/'; return; }
      setMe(m);
    });
  }, []);

  useEffect(() => { tai(); }, [tai]);

  function bao(loai, chu) {
    setTb({ loai, chu });
    setTimeout(() => setTb(null), 4000);
  }

  async function taoUser(e) {
    e.preventDefault();
    const r = await fetch('/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formUser),
    });
    const d = await r.json();
    if (!r.ok) { bao('loi', d.loi); return; }
    bao('ok', `Đã tạo tài khoản ${d.user.username}`);
    setFormUser({ username: '', name: '', pass: '', thi_truong: 'vn' });
    tai();
  }

  async function doiThiTruong(id, ttMoi) {
    const r = await fetch(`/api/admin/users/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'thi_truong', thi_truong: ttMoi }),
    });
    const d = await r.json();
    if (!r.ok) { bao('loi', d.loi); return; }
    bao('ok', `Đã chuyển sang thị trường ${ttMoi === 'kh' ? 'Campuchia' : 'Việt Nam'}`);
    tai();
  }

  async function khoaMo(id, dangKhoa) {
    const r = await fetch(`/api/admin/users/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: dangKhoa ? 'unlock' : 'lock' }),
    });
    const d = await r.json();
    if (!r.ok) { bao('loi', d.loi); return; }
    tai();
  }

  async function luuKey(key, value, ten) {
    if (!value.trim()) return;
    const r = await fetch('/api/admin/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [key]: value.trim() }),
    });
    if (r.ok) { bao('ok', `Đã lưu ${ten}`); tai(); }
    else bao('loi', `Lưu ${ten} thất bại`);
  }

  async function luuSetting(key, value, ten) {
    const r = await fetch('/api/admin/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [key]: value }),
    });
    if (r.ok) { bao('ok', `Đã lưu ${ten}`); tai(); }
  }

  async function thoat() {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/login';
  }

  const tq = data?.tong_quan;
  const maxNgay = Math.max(1, ...(data?.theo_ngay?.map((x) => x.n) || [1]));

  return (
    <Shell muc="so-lieu">
      <div className="adwrap">
        {tb && <div className={`thongbao ${tb.loai}`}>{tb.chu}</div>}
        {data && !data.key_anh_da_cam && (
          <div className="thongbao chuy">
            ⚠️ Chưa cắm key Gemini tạo ảnh — video đang dựng bằng <b>ảnh người que mẫu</b>. Dán key ở mục Cấu hình bên dưới để vẽ ảnh thật theo kịch bản.
          </div>
        )}

        <div className="statrow">
          <div className="stat">
            <div className="k">Video hôm nay</div>
            <div className="v">{tq?.hom_nay ?? '…'}</div>
            <div className={`d${(tq?.hom_nay ?? 0) >= (tq?.hom_qua ?? 0) ? ' xanh' : ''}`}>
              {tq ? `${tq.hom_nay >= tq.hom_qua ? '▲ +' : '▼ −'}${Math.abs(tq.hom_nay - tq.hom_qua)} so hôm qua` : ''}
            </div>
          </div>
          <div className="stat">
            <div className="k">Video {days} ngày</div>
            <div className="v">{tq?.trong_ky ?? '…'}</div>
            <div className="d">{tq ? `${(tq.trong_ky / days).toFixed(1).replace('.', ',')} video/ngày TB` : ''}</div>
          </div>
          <div className="stat">
            <div className="k">Người dùng hoạt động</div>
            <div className="v">{tq ? `${tq.user_hom_nay}/${tq.user_tong}` : '…'}</div>
            <div className="d">hôm nay</div>
          </div>
          <div className="stat">
            <div className="k">Tổng ảnh AI đã vẽ</div>
            <div className="v">{tq?.anh_trong_ky ?? '…'}</div>
            <div className="d">{days} ngày — xem tiền thật ở trang billing Google</div>
          </div>
        </div>

        <div className="panel">
          <h3>
            Video tạo theo ngày
            <select className="chon" value={days} onChange={(e) => setDays(Number(e.target.value))}>
              <option value={7}>7 ngày qua</option>
              <option value={30}>30 ngày qua</option>
              <option value={90}>90 ngày qua</option>
            </select>
          </h3>
          <div className="chart">
            {data?.theo_ngay?.map((x) => (
              <div className="cb" key={x.ngay} title={`${ngayNgan(x.ngay)}: ${x.n} video`}>
                <span className="n">{days <= 14 ? x.n : ''}</span>
                <i className={x.n === 0 ? 'zero' : ''} style={{ height: `${(x.n / maxNgay) * 100}%` }} />
                <b>{ngayNgan(x.ngay)}</b>
              </div>
            ))}
            {data && !data.theo_ngay.length && <div className="dim">Chưa có video nào trong kỳ</div>}
          </div>
        </div>

        <div className="panel">
          <h3 id="tai-khoan">Theo người dùng ({days} ngày)</h3>
          <table className="bang">
            <thead>
              <tr><th>Người dùng</th><th>Hôm nay</th><th>{days} ngày</th><th>Lỗi</th><th>Lần cuối</th><th>Trạng thái</th><th></th></tr>
            </thead>
            <tbody>
              {data?.theo_user?.map((x) => (
                <tr key={x.id}>
                  <td>
                    <a className="ten" href={`/admin/user/${x.id}`}>{x.name || x.username}</a> <span className="dim">{x.username}</span>{' '}
                    <button className="btn-tt" title="Bấm để đổi thị trường — quyết định video của người này làm tiếng gì"
                      onClick={() => doiThiTruong(x.id, x.thi_truong === 'kh' ? 'vn' : 'kh')}>
                      {x.thi_truong === 'kh' ? '🇰🇭 Campuchia' : '🇻🇳 Việt Nam'}
                    </button>
                  </td>
                  <td className="num">{x.hom_nay}</td>
                  <td className="num">{x.trong_ky}</td>
                  <td>{x.loi > 0 ? <span style={{ color: '#c22', fontWeight: 700 }}>{x.loi}</span> : 0}</td>
                  <td>{gioGan(x.lan_cuoi)}</td>
                  <td>{x.status === 'active'
                    ? <span className="pill p-ok">Hoạt động</span>
                    : <span className="pill p-err">Đã khoá</span>}</td>
                  <td style={{ textAlign: 'right' }}>
                    {x.id !== me?.id && (
                      <button className={`btn-sm${x.status === 'active' ? ' nguy' : ''}`} onClick={() => khoaMo(x.id, x.status !== 'active')}>
                        {x.status === 'active' ? 'Khoá' : 'Mở khoá'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <form className="form-dong" onSubmit={taoUser}>
            <input placeholder="tên đăng nhập (vd: van)" required value={formUser.username}
              onChange={(e) => setFormUser({ ...formUser, username: e.target.value })} />
            <input placeholder="Tên hiển thị" value={formUser.name}
              onChange={(e) => setFormUser({ ...formUser, name: e.target.value })} />
            <input placeholder="Mật khẩu (≥6 ký tự)" required minLength={6} value={formUser.pass}
              onChange={(e) => setFormUser({ ...formUser, pass: e.target.value })} />
            <select value={formUser.thi_truong || 'vn'} onChange={(e) => setFormUser({ ...formUser, thi_truong: e.target.value })}>
              <option value="vn">🇻🇳 Việt Nam</option>
              <option value="kh">🇰🇭 Campuchia</option>
            </select>
            <button className="btn-sm chinh">+ Tạo tài khoản</button>
          </form>
        </div>

        <DoanNhanVat bao={bao} />

        <KhoNhac bao={bao} />

        <div className="panel">
          <h3 id="cau-hinh">⚙️ Cấu hình hệ thống</h3>
          <table className="bang">
            <tbody>
              <tr>
                <td style={{ width: 230 }}>Key <b>TRẢ PHÍ</b> — chỉ để <b>vẽ ảnh</b><br /><span className="dim" style={{ fontWeight: 400 }}>không dùng cho bước nào khác</span></td>
                <td>
                  {data?.key_anh_da_cam
                    ? <span className="pill p-ok">Đã cắm {st?.gemini_key_image}</span>
                    : <span className="pill p-err">Chưa cắm — đang dùng ảnh mẫu</span>}
                </td>
                <td style={{ textAlign: 'right' }}>
                  <input style={{ border: '1.5px solid #d5d9e0', borderRadius: 7, padding: '6px 10px', fontSize: 12, width: 220 }}
                    placeholder="Dán key mới vào đây…" value={keyAnh} onChange={(e) => setKeyAnh(e.target.value)} />{' '}
                  <button className="btn-sm chinh" onClick={() => { luuKey('gemini_key_image', keyAnh, 'key tạo ảnh'); setKeyAnh(''); }}>Lưu</button>
                </td>
              </tr>
              <tr>
                <td>Key trả phí dự phòng <span className="dim" style={{ fontWeight: 400 }}>(hiện KHÔNG được dùng — mọi bước ngoài vẽ ảnh chạy key free)</span></td>
                <td>
                  {data?.key_text_da_cam
                    ? <span className="pill p-ok">Đã cắm {st?.gemini_key_text}</span>
                    : <span className="pill p-err">Chưa cắm — B2/B4 sẽ lỗi</span>}
                </td>
                <td style={{ textAlign: 'right' }}>
                  <input style={{ border: '1.5px solid #d5d9e0', borderRadius: 7, padding: '6px 10px', fontSize: 12, width: 220 }}
                    placeholder="Dán key mới vào đây…" value={keyText} onChange={(e) => setKeyText(e.target.value)} />{' '}
                  <button className="btn-sm chinh" onClick={() => { luuKey('gemini_key_text', keyText, 'key phân tích/voice'); setKeyText(''); }}>Lưu</button>
                </td>
              </tr>
              <tr>
                <td>Kho <b>key free</b> luân phiên<br /><span className="dim" style={{ fontWeight: 400 }}>gánh TOÀN BỘ: kịch bản · đạo diễn hình · giọng đọc</span></td>
                <td>
                  {st?.keys_free?.length
                    ? <span className="pill p-ok">Đang có {st.keys_free.length} key: {st.keys_free.map((k) => `•${k.cuoi}`).join(' ')}</span>
                    : <span className="pill p-wait">Chưa có key free — đang dùng key trả phí cho mọi bước</span>}
                  <div className="dim" style={{ fontSize: 11, marginTop: 5 }}>
                    Thử lần lượt từng key free, hết quota thì nhảy key kế. <b>Hết cả kho thì job báo lỗi</b> —
                    KHÔNG tự tiêu tiền key trả phí. Chỉ bước vẽ ảnh dùng key trả phí (free tier bị Google chặn vẽ ảnh).
                  </div>
                </td>
                <td style={{ textAlign: 'right', verticalAlign: 'top' }}>
                  <textarea rows={4} value={keysFree} onChange={(e) => setKeysFree(e.target.value)}
                    placeholder={'Dán mỗi dòng 1 key free\nAIza...\nAIza...'}
                    style={{ width: 250, border: '1.5px solid #d5d9e0', borderRadius: 8, padding: '7px 10px', fontSize: 11.5, fontFamily: 'monospace' }} />
                  <div style={{ marginTop: 5 }}>
                    <button className="btn-sm chinh" onClick={() => { luuSetting('gemini_keys_free', keysFree, 'kho key free'); setKeysFree(''); }}>Lưu kho key</button>{' '}
                    <button className="btn-sm nguy" onClick={() => { if (window.confirm('Xoá hết key free?')) { luuSetting('gemini_keys_free', '', 'xoá kho key'); setKeysFree(''); } }}>Xoá hết</button>
                  </div>
                </td>
              </tr>
              <tr>
                <td>Tự xoá video sau</td>
                <td><b>{st?.retention_days ?? '…'} ngày</b> <span className="dim">(lịch sử + thumbnail giữ lại để đếm)</span></td>
                <td style={{ textAlign: 'right' }}>
                  <select className="chon" value={st?.retention_days || '7'}
                    onChange={(e) => luuSetting('retention_days', e.target.value, 'kỳ hạn lưu')}>
                    <option value="3">3 ngày</option><option value="7">7 ngày</option>
                    <option value="14">14 ngày</option><option value="30">30 ngày</option>
                  </select>
                </td>
              </tr>
              <tr>
                <td>Chữ ký đáy video (brand)</td>
                <td colSpan={2}>
                  <input style={{ border: '1.5px solid #d5d9e0', borderRadius: 7, padding: '6px 10px', fontSize: 12, width: 220 }}
                    defaultValue={st?.brand || ''} placeholder='vd "Thì Thầm" — để trống nếu chưa có'
                    onBlur={(e) => { if (e.target.value !== (st?.brand || '')) luuSetting('brand', e.target.value, 'chữ ký'); }} />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </Shell>
  );
}

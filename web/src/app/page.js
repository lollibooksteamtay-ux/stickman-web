'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Shell from './shell';

const TEN_BUOC = {
  1: 'tải video mẫu',
  2: 'viết kịch bản',
  3: 'tạo ảnh',
  4: 'đọc voice',
  5: 'ghép video',
};

function ngayGio(s) {
  const d = new Date(s);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')} · ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function conLai(finishedAt, retentionDays = 7) {
  const het = new Date(finishedAt).getTime() + retentionDays * 86400_000;
  const ngay = Math.ceil((het - Date.now()) / 86400_000);
  return ngay > 0 ? ngay : 0;
}

function TheVideo({ j, onRetry, onXem, onXoa, onSuaBia }) {
  const isExp = j.status === 'done' && j.file_deleted;
  const xemDuoc = j.status === 'done' && !j.file_deleted;
  return (
    <div className={`card${isExp ? ' expired' : ''}`}>
      <div
        className={`thumb${xemDuoc ? ' xem-duoc' : ''}`}
        onClick={() => xemDuoc && onXem(j)}
        title={xemDuoc ? 'Bấm để xem ngay' : undefined}
      >
        {/* thumb chỉ có sau bước tạo ảnh; trước đó hiện khung đen */}
        {j.step >= 3 || j.status === 'done' ? (
          <img src={`/api/jobs/${j.id}/thumb`} alt="" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
        ) : (
          <span className="rong">🎬</span>
        )}
        {xemDuoc && <span className="nut-xem">▶</span>}
        {j.status === 'running' && (
          <div className="prog" style={{ width: `${Math.max(8, (j.step / 5) * 100)}%` }} />
        )}
      </div>
      <div className="meta">
        <div className="t" title={j.title}>{j.title}</div>
        <div className="dt">{ngayGio(j.created_at)}{j.anh_tam ? ' · ảnh tạm' : ''}{j.voice_mode === 'upload' ? ' · 📁 audio riêng' : ''}</div>

        {j.status === 'done' && !j.file_deleted && (
          <>
            <span className="pill p-ok">✓ Xong · còn {conLai(j.finished_at)} ngày</span>
            <div className="act-row">
              <button className="btn-xem" onClick={() => onXem(j)}>▶ Xem</button>
              <a className="btn-ico" title="Tải gói: video + ảnh bìa (.zip)" href={`/api/jobs/${j.id}/goi`}>⬇</a>
              <button className="btn-ico" title="Thiết kế ảnh bìa" onClick={() => onSuaBia(j)}>🖼</button>
              <button className="btn-ico nguy" title="Xoá video" onClick={() => onXoa(j)}>🗑</button>
            </div>
          </>
        )}
        {isExp && (
          <>
            <span className="pill p-exp">Hết hạn lưu — file đã xoá</span>
            <div className="act-row">
              <button className="btn-ico nguy" title="Xoá khỏi danh sách" onClick={() => onXoa(j)}>🗑</button>
            </div>
          </>
        )}
        {j.status === 'running' && (
          <>
            <span className="pill p-run">◉ Bước {j.step}/5</span>
            <div className="step">{j.step_note || TEN_BUOC[j.step] || '…'}</div>
          </>
        )}
        {j.status === 'queued' && (
          <>
            <span className="pill p-wait">◌ Hàng đợi #{j.vi_tri_cho}</span>
            <div className="act-row">
              <button className="btn-ico nguy" title="Huỷ và xoá" onClick={() => onXoa(j)}>🗑</button>
            </div>
          </>
        )}
        {j.status === 'error' && (
          <>
            <span className="pill p-err" title={j.error_text}>✕ Lỗi bước {j.step || '?'}</span>
            <div className="act-row">
              <button className="btn-xem" onClick={() => onRetry(j.id)}>↻ Chạy lại</button>
              <button className="btn-ico nguy" title="Xoá video" onClick={() => onXoa(j)}>🗑</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// Chế độ Bảng: mỗi video 1 hàng, cột = tính năng & trạng thái (dễ quản khi nhiều video)
function BangVideo({ jobs, onXem, onXoa, onSuaBia, onRetry }) {
  return (
    <div className="bang-wrap">
      <table className="bang-video">
        <thead>
          <tr>
            <th>#</th><th>Video</th><th>Trạng thái</th><th>Giọng</th><th>Nhạc</th>
            <th>Bìa</th><th>Cảnh</th><th>Tạo lúc</th><th>Thao tác</th>
          </tr>
        </thead>
        <tbody>
          {jobs.map((j, k) => {
            const xong = j.status === 'done' && !j.file_deleted;
            return (
              <tr key={j.id}>
                <td className="b-stt">{k + 1}</td>
                <td className="b-ten">
                  {(j.step >= 3 || j.status === 'done') && (
                    <img className="b-thumb" src={`/api/jobs/${j.id}/thumb`} alt=""
                      onClick={() => xong && onXem(j)}
                      onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }} />
                  )}
                  {j.title}
                </td>
                <td>
                  {xong && <span className="pill p-ok">✓ Xong</span>}
                  {j.status === 'done' && j.file_deleted && <span className="pill p-exp">Hết hạn</span>}
                  {j.status === 'running' && <span className="pill p-run">◉ Bước {j.step}/5</span>}
                  {j.status === 'queued' && <span className="pill p-wait">◌ Chờ #{j.vi_tri_cho}</span>}
                  {j.status === 'error' && <span className="pill p-err" title={j.error_text}>✕ Lỗi bước {j.step || '?'}</span>}
                </td>
                <td className="b-nhat">{j.voice_mode === 'upload' ? '📁 audio riêng' : (j.giong || '—')}</td>
                <td className="b-nhat">{j.nhac_nhom === 'khong' ? '—' : j.nhac_nhom === 'upload' ? 'tự tải lên' : 'kho nhạc'}</td>
                <td>{xong ? <span className="b-co">✓</span> : <span className="b-khong">—</span>}</td>
                <td className="b-nhat">{j.scenes || '—'}</td>
                <td className="b-nhat">{ngayGio(j.created_at)}</td>
                <td>
                  <div className="b-act">
                    {xong && (
                      <>
                        <button className="btn-xem" style={{ flex: 'none', padding: '0 10px' }} onClick={() => onXem(j)}>▶ Xem</button>
                        <a className="btn-ico" title="Tải gói: video + ảnh bìa" href={`/api/jobs/${j.id}/goi`}>⬇</a>
                        <button className="btn-ico" title="Thiết kế bìa" onClick={() => onSuaBia(j)}>🖼</button>
                      </>
                    )}
                    {j.status === 'error' && (
                      <button className="btn-xem" style={{ flex: 'none', padding: '0 10px' }} onClick={() => onRetry(j.id)}>↻ Chạy lại</button>
                    )}
                    {j.status !== 'running' && (
                      <button className="btn-ico nguy" title="Xoá video" onClick={() => onXoa(j)}>🗑</button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
          {!jobs.length && (
            <tr><td colSpan={9} style={{ textAlign: 'center', color: '#9aa1ab', padding: '34px 0' }}>
              Chưa có video nào — dán link phía trên để bắt đầu
            </td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// Trình thiết kế bìa: chọn ảnh cảnh + 2 dòng chữ + gắn bìa đầu video
function BiaDesigner({ job, onClose }) {
  const [scenes, setScenes] = useState([]);
  const [anhChon, setAnhChon] = useState('');
  const [trang, setTrang] = useState('');
  const [vang, setVang] = useState('');
  const [biaDau, setBiaDau] = useState(true);
  const [dangLuu, setDangLuu] = useState(false);
  const [loi, setLoi] = useState('');

  useEffect(() => {
    fetch(`/api/jobs/${job.id}/scenes`).then(async (r) => {
      if (!r.ok) { setLoi('Không tải được danh sách cảnh'); return; }
      const d = await r.json();
      setScenes(d.scenes || []);
      setAnhChon(d.bia_anh || d.scenes?.[0] || '');
      setBiaDau(d.bia_dau !== false);
      const cu = (d.bia_text || d.title || '');
      if (cu.includes('|')) {
        const [t, v] = cu.split('|');
        setTrang(t.trim()); setVang(v.trim());
      } else {
        const tu = cu.split(' ');
        if (tu.length >= 4) { setTrang(tu.slice(0, -2).join(' ')); setVang(tu.slice(-2).join(' ')); }
        else setVang(cu);
      }
    });
  }, [job.id]);

  async function luu() {
    if (!trang.trim() && !vang.trim()) { setLoi('Nhập ít nhất 1 dòng chữ'); return; }
    setLoi(''); setDangLuu(true);
    const r = await fetch(`/api/jobs/${job.id}/bia`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trang: trang.trim(), vang: vang.trim(), anh: anhChon, bia_dau: biaDau }),
    });
    const d = await r.json().catch(() => ({}));
    setDangLuu(false);
    if (!r.ok) { setLoi(d.loi || 'Lưu thất bại'); return; }
    window.location.reload();
  }

  return (
    <div className="xem-overlay" onClick={() => !dangLuu && onClose()}>
      <div className="bia-box" onClick={(e) => e.stopPropagation()}>
        <div className="xem-top">
          <span className="xem-ten">🖼 Thiết kế bìa — {job.title}</span>
          <button className="btn-sm" onClick={onClose} disabled={dangLuu}>✕ Đóng</button>
        </div>
        <div className="bia-body">
          <div className="bia-preview">
            {anhChon ? (
              <div className="bia-khung">
                <img src={`/api/jobs/${job.id}/anh/${anhChon}`} alt="" />
                <div className="bia-chu">
                  {trang && <div className="bia-trang">{trang.toUpperCase()}</div>}
                  {vang && <div className="bia-vang">{vang.toUpperCase()}</div>}
                </div>
              </div>
            ) : <div className="dim" style={{ padding: 30 }}>Đang tải…</div>}
            <div className="dim" style={{ fontSize: 11, marginTop: 6, textAlign: 'center' }}>
              Xem trước gần đúng — bản thật do máy chủ vẽ nét chuẩn hơn
            </div>
          </div>
          <div className="bia-form">
            <label>Dòng trắng (nhỏ)
              <input value={trang} maxLength={60} placeholder="vd: CUỘC CHIẾN VỚI"
                onChange={(e) => setTrang(e.target.value)} />
            </label>
            <label>Dòng VÀNG TO (từ khoá đắt)
              <input value={vang} maxLength={60} placeholder="vd: CHÍNH MÌNH"
                onChange={(e) => setVang(e.target.value)} />
            </label>
            <div style={{ fontSize: 12, fontWeight: 650, margin: '4px 0 4px' }}>Chọn ảnh nền (ảnh trong video):</div>
            <div className="bia-scenes">
              {scenes.map((f) => (
                <img key={f} src={`/api/jobs/${job.id}/anh/${f}`} alt={f}
                  className={anhChon === f ? 'chon' : ''} onClick={() => setAnhChon(f)} />
              ))}
            </div>
            <label className="bia-toggle">
              <input type="checkbox" checked={biaDau} onChange={(e) => setBiaDau(e.target.checked)} />
              Gắn bìa vào 0,3s đầu video (đăng đâu cũng hiện đúng bìa)
            </label>
            {loi && <div className="bao-loi">{loi}</div>}
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <button className="btn-xem" style={{ flex: 1, marginTop: 0 }} onClick={luu} disabled={dangLuu}>
                {dangLuu ? '⏳ Đang vẽ bìa + dựng video (~30-60s)…' : '💾 Lưu bìa'}
              </button>
              <a className="btn-dl" style={{ flex: 1, marginTop: 0 }} href={`/api/jobs/${job.id}/thumbnail`}>
                ⬇ Tải file bìa
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function TrangChinh() {
  const [me, setMe] = useState(null);
  const [data, setData] = useState(null);
  const [tab, setTab] = useState('all');
  const [page, setPage] = useState(1);
  const [link, setLink] = useState('');
  const [loi, setLoi] = useState('');
  const [dangGui, setDangGui] = useState(false);
  const [dsGiong, setDsGiong] = useState([]);
  const [voiceMode, setVoiceMode] = useState('ai');   // 'ai' | 'upload'
  const [thiTruong, setThiTruong] = useState('vn');   // lấy từ TÀI KHOẢN (/api/me) — admin khai báo 1 lần, không chọn lại từng video
  const [giong, setGiong] = useState('Charon');
  const [audioFile, setAudioFile] = useState(null);
  const [dangPhat, setDangPhat] = useState('');       // id giọng đang nghe thử
  const [nhacNhom, setNhacNhom] = useState('');
  const [nhacFile, setNhacFile] = useState(null);
  const [dsNhac, setDsNhac] = useState([]);
  const [biaText, setBiaText] = useState('');
  const [biaJob, setBiaJob] = useState(null);         // job đang mở trình thiết kế bìa
  const [videoXem, setVideoXem] = useState(null);     // job đang mở popup xem
  const [cheDo, setCheDo] = useState('luoi');         // 'luoi' | 'bang'
  const audioRef = useRef(null);
  const timerRef = useRef(null);

  const taiDs = useCallback(async (tabHienTai = tab, trang = page) => {
    const r = await fetch(`/api/jobs?tab=${tabHienTai}&page=${trang}`);
    if (r.status === 401) { window.location.href = '/login'; return; }
    setData(await r.json());
  }, [tab, page]);

  useEffect(() => {
    fetch('/api/me').then(async (r) => {
      if (r.status === 401) { window.location.href = '/login'; return; }
      const m = await r.json();
      setMe(m);
      setThiTruong(m.thi_truong === 'kh' ? 'kh' : 'vn');
    });
    fetch('/api/voices').then(async (r) => {
      if (r.ok) setDsGiong((await r.json()).giong || []);
    });
    fetch('/api/music').then(async (r) => {
      if (r.ok) setDsNhac((await r.json()).bai || []);
    });
  }, []);

  function ngheNhac(v) {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    if (dangPhat === v) { setDangPhat(''); return; }
    const [nhom, ...rest] = v.slice(4).split('/');
    const url = rest.length
      ? `/api/music/play?nhom=${nhom}&file=${encodeURIComponent(rest.join('/'))}`
      : `/api/music/play?nhom=goc&file=${encodeURIComponent(nhom)}`;
    const a = new Audio(url);
    audioRef.current = a;
    setDangPhat(v);
    a.onended = () => setDangPhat('');
    a.play().catch(() => setDangPhat(''));
  }

  function ngheThu(id) {
    // Bấm lại giọng đang phát thì dừng
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    if (dangPhat === id) { setDangPhat(''); return; }
    const a = new Audio(`/api/voices/${id}/sample?tt=${thiTruong}&v=kh1`); // ?v đổi khi thay bộ giọng — né cache trình duyệt
    audioRef.current = a;
    setDangPhat(id);
    a.onended = () => setDangPhat('');
    a.onerror = () => { setDangPhat(''); setLoi('Chưa có file nghe thử cho giọng này'); };
    a.play().catch(() => setDangPhat(''));
  }

  useEffect(() => {
    taiDs();
    // Tự làm mới mỗi 5s để thấy tiến độ nhích
    timerRef.current = setInterval(() => taiDs(), 5000);
    return () => clearInterval(timerRef.current);
  }, [taiDs]);

  async function taoVideo(e) {
    e.preventDefault();
    setLoi('');
    if (voiceMode === 'upload' && !audioFile) { setLoi('Chọn file audio trước đã'); return; }
    if (nhacNhom === 'upload' && !nhacFile) { setLoi('Chọn file nhạc nền trước đã'); return; }
    setDangGui(true);
    let r;
    if (voiceMode === 'upload' || nhacNhom === 'upload') {
      const fd = new FormData();
      fd.set('url', link);
      fd.set('voice_mode', voiceMode);
      fd.set('giong', giong);
      if (voiceMode === 'upload') fd.set('audio', audioFile);
      fd.set('nhac_nhom', nhacNhom);
      if (nhacNhom === 'upload') fd.set('nhac', nhacFile);
      
      r = await fetch('/api/jobs', { method: 'POST', body: fd });
    } else {
      r = await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: link, giong, nhac_nhom: nhacNhom }),
      });
    }
    const d = await r.json();
    setDangGui(false);
    if (!r.ok) { setLoi(d.loi || 'Tạo job thất bại'); return; }
    setLink(''); setAudioFile(null); setNhacFile(null); setBiaText('');
    setTab('all'); setPage(1);
    taiDs('all', 1);
  }

  async function chayLai(id) {
    await fetch(`/api/jobs/${id}/retry`, { method: 'POST' });
    taiDs();
  }

  function suaBia(j) { setBiaJob(j); }

  async function xoaVideo(j) {
    if (!window.confirm(`Xoá hẳn video "${j.title}"? File trên máy chủ sẽ bị xoá, không lấy lại được.`)) return;
    const r = await fetch(`/api/jobs/${j.id}`, { method: 'DELETE' });
    if (!r.ok) { const d = await r.json().catch(() => ({})); setLoi(d.loi || 'Xoá thất bại'); return; }
    taiDs();
  }

  async function thoat() {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/login';
  }

  function doiTab(t) { setTab(t); setPage(1); }

  const dem = data?.dem;
  const thang = data?.thang;
  const thangNay = new Date().getMonth() + 1;

  return (
    <Shell muc="video">
      <div className="hero">
        <h1>Dán link video mẫu, nhận video người que</h1>
        <p>YouTube · TikTok · Facebook · Douyin → video dọc 1080×1920 hoàn chỉnh trong ~4-6 phút</p>

        <form className="composer" onSubmit={taoVideo}>
          <div className="comp-link">
            <input
              value={link}
              placeholder={voiceMode === 'upload'
                ? 'Link video mẫu — không bắt buộc, bỏ trống thì hình tự vẽ theo audio'
                : 'https://tiktok.com/… · youtube.com/shorts/… · facebook.com/reel/…'}
              onChange={(e) => setLink(e.target.value)}
            />
            <button className="comp-submit" disabled={dangGui || (voiceMode === 'ai' ? !link.trim() : !audioFile)}>
              {dangGui ? 'Đang gửi…' : '⚡ Tạo video'}
            </button>
          </div>

          <div className="comp-grid">
            <section className="comp-sec">
              <div className="sec-label">
                Giọng đọc
                {thiTruong === 'kh' && <span className="tt-badge">🇰🇭 Tiếng Khmer</span>}
              </div>
              <div className="seg">
                <button type="button" className={voiceMode === 'ai' ? 'on' : ''} onClick={() => setVoiceMode('ai')}>🎙 Giọng AI</button>
                <button type="button" className={voiceMode === 'upload' ? 'on' : ''} onClick={() => setVoiceMode('upload')}>📁 Audio của tôi</button>
              </div>
              {voiceMode === 'ai' ? (
                <div className="voice-list">
                  {dsGiong.map((g) => (
                    <label key={g.id} className={`voice-item${giong === g.id ? ' chon' : ''}`}>
                      <input type="radio" name="giong" checked={giong === g.id} onChange={() => setGiong(g.id)} />
                      <span className="v-ten">{g.ten}</span>
                      <span className="v-mota">{g.mo_ta}</span>
                      <button type="button" className="v-nghe" onClick={(e) => { e.preventDefault(); ngheThu(g.id); }}>
                        {dangPhat === g.id ? '⏸' : '▶'}
                      </button>
                    </label>
                  ))}
                </div>
              ) : (
                <div className="file-drop">
                  <input id="audio-file" type="file" accept=".mp3,.m4a,.wav,.aac,.ogg,audio/*"
                    onChange={(e) => setAudioFile(e.target.files?.[0] || null)} />
                  <label htmlFor="audio-file" className="file-nut">
                    {audioFile ? `🎧 ${audioFile.name} (${(audioFile.size / 1e6).toFixed(1)}MB)` : '⬆ Chọn file audio (≤20MB)'}
                  </label>
                  <p className="ghichu">
                    Hệ thống nghe audio của bạn, bóc lời + mốc thời gian từng câu rồi vẽ hình khớp theo.
                    Link video mẫu chỉ để học phong cách hình, bỏ trống cũng được.
                  </p>
                </div>
              )}
            </section>

            <section className="comp-sec">
              <div className="sec-label">Nhạc nền</div>
              <select value={nhacNhom} onChange={(e) => { setNhacNhom(e.target.value); setNhacFile(null); }}>
                <option value="">Ngẫu nhiên trong kho nhạc</option>
                <option value="upload">⬆ Tự tải nhạc nền lên</option>
              </select>
              {nhacNhom === 'upload' && (
                <div className="file-drop">
                  <input id="nhac-file" type="file" accept=".mp3,.m4a,.wav,.aac,audio/*"
                    onChange={(e) => setNhacFile(e.target.files?.[0] || null)} />
                  <label htmlFor="nhac-file" className="file-nut">
                    {nhacFile ? `🎵 ${nhacFile.name}` : '⬆ Chọn file nhạc (≤15MB)'}
                  </label>
                </div>
              )}
              <p className="ghichu">
                Ảnh bìa video sẽ tự tạo theo nội dung — muốn đổi ảnh nền hay chữ bìa thì bấm
                nút 🖼 trên video sau khi xong.
              </p>
              </section>
          </div>
          {loi && <div className="bao-loi">{loi}</div>}
        </form>
      </div>

      <div className="toolrow">
        <div className="mystat">
          {thang ? (
            <>Tháng {thangNay} của bạn: <b>{thang.tong} video</b> · {thang.xong} thành công · {thang.loi} lỗi</>
          ) : '…'}
        </div>
        <div className="tabs">
          <div className="view-doi">
            <button type="button" className={cheDo === 'luoi' ? 'on' : ''} onClick={() => setCheDo('luoi')}>▦ Lưới</button>
            <button type="button" className={cheDo === 'bang' ? 'on' : ''} onClick={() => setCheDo('bang')}>☰ Bảng</button>
          </div>
          <button className={`tab${tab === 'all' ? ' on' : ''}`} onClick={() => doiTab('all')}>Tất cả ({dem?.tat_ca ?? 0})</button>
          <button className={`tab${tab === 'running' ? ' on' : ''}`} onClick={() => doiTab('running')}>Đang chạy ({dem?.dang_chay ?? 0})</button>
          <button className={`tab${tab === 'fresh' ? ' on' : ''}`} onClick={() => doiTab('fresh')}>Còn hạn tải ({dem?.con_han ?? 0})</button>
          <button className={`tab${tab === 'error' ? ' on' : ''}`} onClick={() => doiTab('error')}>Lỗi ({dem?.loi ?? 0})</button>
        </div>
      </div>

      {cheDo === 'luoi' ? (
        <div className="grid">
          {data?.jobs?.map((j) => <TheVideo key={j.id} j={j} onRetry={chayLai} onXem={setVideoXem} onXoa={xoaVideo} onSuaBia={suaBia} />)}
          {data && !data.jobs.length && (
            <div style={{ gridColumn: '1/-1', textAlign: 'center', color: '#9aa1ab', padding: '40px 0', fontSize: 13.5 }}>
              Chưa có video nào — dán link phía trên để bắt đầu
            </div>
          )}
        </div>
      ) : (
        <BangVideo jobs={data?.jobs || []} onXem={setVideoXem} onXoa={xoaVideo} onSuaBia={suaBia} onRetry={chayLai} />
      )}

      {data && data.so_trang > 1 && (
        <div className="pager">
          {Array.from({ length: data.so_trang }, (_, i) => i + 1).map((p) => (
            <button key={p} className={p === page ? 'cur' : ''} onClick={() => setPage(p)}>{p}</button>
          ))}
          <span className="tong">…{dem?.tat_ca} video</span>
        </div>
      )}

      {biaJob && <BiaDesigner job={biaJob} onClose={() => setBiaJob(null)} />}

      {videoXem && (
        <div className="xem-overlay" onClick={() => setVideoXem(null)}>
          <div className="xem-box" onClick={(e) => e.stopPropagation()}>
            <div className="xem-top">
              <span className="xem-ten">{videoXem.title}</span>
              <div className="xem-act">
                <a className="btn-sm chinh" href={`/api/jobs/${videoXem.id}/download`}>⬇ Tải về</a>
                <button className="btn-sm" onClick={() => setVideoXem(null)}>✕ Đóng</button>
              </div>
            </div>
            <video
              src={`/api/jobs/${videoXem.id}/stream`}
              controls autoPlay playsInline
              className="xem-video"
            />
          </div>
        </div>
      )}
    </Shell>
  );
}

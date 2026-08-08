'use client';
import { useCallback, useEffect, useState } from 'react';
import Shell from '../../shell';

function ngayGio(s) {
  const d = new Date(s);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')} · ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export default function TatCaVideo() {
  const [data, setData] = useState(null);
  const [userId, setUserId] = useState('all');
  const [days, setDays] = useState(30);
  const [page, setPage] = useState(1);
  const [videoXem, setVideoXem] = useState(null);
  const [hienXoa, setHienXoa] = useState(false);

  const tai = useCallback(async () => {
    const r = await fetch(`/api/admin/videos?user=${userId}&days=${days}&page=${page}&hien_xoa=${hienXoa ? 1 : 0}`);
    if (r.status === 401 || r.status === 403) { window.location.href = '/'; return; }
    setData(await r.json());
  }, [userId, days, page, hienXoa]);

  useEffect(() => { tai(); }, [tai]);

  return (
    <Shell muc="tat-ca">
      <div className="adwrap">
        <div className="uhead">
          <h2>Tất cả video của team <span className="dim">· {data?.tong ?? '…'} video</span></h2>
          <div style={{ display: 'flex', gap: 8 }}>
            <select className="chon" value={userId} onChange={(e) => { setUserId(e.target.value); setPage(1); }}>
              <option value="all">Tất cả mọi người</option>
              {data?.users?.map((x) => <option key={x.id} value={x.id}>{x.name || x.username}</option>)}
            </select>
            <select className="chon" value={days} onChange={(e) => { setDays(Number(e.target.value)); setPage(1); }}>
              <option value={7}>7 ngày</option>
              <option value={30}>30 ngày</option>
              <option value={90}>90 ngày</option>
            </select>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--chu-mo)' }}>
              <input type="checkbox" checked={hienXoa} style={{ accentColor: 'var(--xanh)' }}
                onChange={(e) => { setHienXoa(e.target.checked); setPage(1); }} />
              Hiện cả video đã xoá
            </label>
          </div>
        </div>

        <div className="grid" style={{ padding: 0 }}>
          {data?.videos?.map((j) => {
            const xemDuoc = j.status === 'done' && !j.file_deleted && !j.user_deleted;
            return (
              <div className="card" key={j.id}>
                <div className={`thumb${xemDuoc ? ' xem-duoc' : ''}`} onClick={() => xemDuoc && setVideoXem(j)}>
                  {j.user_deleted || j.file_deleted ? (
                    <span className="rong">{j.user_deleted ? '🗑' : '⏳'}</span>
                  ) : (
                    <img src={`/api/jobs/${j.id}/thumb`} alt=""
                      onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                  )}
                  {xemDuoc && <span className="nut-xem">▶</span>}
                </div>
                <div className="meta">
                  <div className="t" title={j.title}>{j.title}</div>
                  <div className="dt">👤 {j.ten_nguoi || j.username} · {ngayGio(j.created_at)}</div>
                  {xemDuoc ? (
                    <>
                      <button className="btn-xem" onClick={() => setVideoXem(j)}>▶ Xem ngay</button>
                      <a className="btn-dl" href={`/api/jobs/${j.id}/goi`}>⬇ Tải gói</a>
                    </>
                  ) : (
                    <span className="pill p-exp">
                      {j.user_deleted ? 'Đã xoá tay' : j.status === 'done' ? 'Hết hạn lưu' : j.status}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
          {data && !data.videos.length && (
            <div style={{ gridColumn: '1/-1', textAlign: 'center', color: '#9aa1ab', padding: '40px 0', fontSize: 13.5 }}>
              Không có video nào trong kỳ đã chọn
            </div>
          )}
        </div>

        {data && data.so_trang > 1 && (
          <div className="pager" style={{ paddingTop: 16 }}>
            {Array.from({ length: data.so_trang }, (_, i) => i + 1).map((p) => (
              <button key={p} className={p === page ? 'cur' : ''} onClick={() => setPage(p)}>{p}</button>
            ))}
          </div>
        )}
      </div>

      {videoXem && (
        <div className="xem-overlay" onClick={() => setVideoXem(null)}>
          <div className="xem-box" onClick={(e) => e.stopPropagation()}>
            <div className="xem-top">
              <span className="xem-ten">{videoXem.ten_nguoi || videoXem.username} · {videoXem.title}</span>
              <div className="xem-act">
                <a className="btn-sm chinh" href={`/api/jobs/${videoXem.id}/download`}>⬇ Tải về</a>
                <button className="btn-sm" onClick={() => setVideoXem(null)}>✕ Đóng</button>
              </div>
            </div>
            <video src={`/api/jobs/${videoXem.id}/stream`} controls autoPlay playsInline className="xem-video" />
          </div>
        </div>
      )}
    </Shell>
  );
}

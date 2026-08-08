'use client';
import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Shell from '../../../shell';

function ngayGio(s) {
  const d = new Date(s);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')} · ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
function tenThang(ym) {
  const [y, m] = ym.split('-');
  return `Tháng ${Number(m)}/${y}`;
}

export default function ChiTietNguoiDung() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [month, setMonth] = useState('');
  const [page, setPage] = useState(1);

  const tai = useCallback(async (m = month, p = page) => {
    const qs = new URLSearchParams();
    if (m) qs.set('month', m);
    qs.set('page', String(p));
    const r = await fetch(`/api/admin/users/${id}?${qs}`);
    if (r.status === 401 || r.status === 403) { window.location.href = '/'; return; }
    setData(await r.json());
  }, [id, month, page]);

  useEffect(() => { tai(); }, [tai]);

  const th = data?.tong_hop;
  const soNgayTrongThang = data ? new Date(
    Number(data.thang.slice(0, 4)), Number(data.thang.slice(5, 7)), 0
  ).getDate() : 30;
  const mapNgay = Object.fromEntries((data?.theo_ngay || []).map((x) => [x.ngay, x.n]));
  const maxN = Math.max(1, ...(data?.theo_ngay?.map((x) => x.n) || [1]));
  const ngayCaoNhat = data?.theo_ngay?.reduce((a, b) => (b.n > (a?.n || 0) ? b : a), null);

  return (
    <Shell muc="tat-ca">
      <div className="adwrap">
        <div className="crumb"><a href="/admin">← Quản trị</a> / Chi tiết người dùng</div>
        <div className="uhead">
          <h2>{data?.user?.name || data?.user?.username} <span className="dim">· {data?.user?.username}</span></h2>
          <select className="chon" value={data?.thang || ''} onChange={(e) => { setMonth(e.target.value); setPage(1); }}>
            {(data?.cac_thang?.length ? data.cac_thang : [data?.thang].filter(Boolean)).map((t) => (
              <option key={t} value={t}>{tenThang(t)}</option>
            ))}
          </select>
        </div>

        <div className="statrow">
          <div className="stat">
            <div className="k">Video {data ? tenThang(data.thang).toLowerCase() : ''}</div>
            <div className="v">{th?.tong ?? '…'}</div>
            <div className="d">{th ? `TB ${(th.tong / soNgayTrongThang).toFixed(1).replace('.', ',')} video/ngày` : ''}</div>
          </div>
          <div className="stat">
            <div className="k">Ngày cao nhất</div>
            <div className="v">{ngayCaoNhat?.n ?? 0}</div>
            <div className="d">{ngayCaoNhat ? `hôm ${String(ngayCaoNhat.ngay).padStart(2, '0')}/${data.thang.slice(5, 7)}` : '—'}</div>
          </div>
          <div className="stat">
            <div className="k">Lỗi / tỉ lệ</div>
            <div className={`v${th?.loi ? ' warn' : ''}`}>{th?.loi ?? 0}</div>
            <div className="d">{th && th.tong > 0 ? `${Math.round((th.loi / th.tong) * 100)}% — ${th.xong} thành công` : '—'}</div>
          </div>
        </div>

        <div className="panel">
          <h3>Video theo ngày — {data ? tenThang(data.thang).toLowerCase() : ''} (mỗi cột 1 ngày)</h3>
          <div className="chart">
            {Array.from({ length: soNgayTrongThang }, (_, i) => i + 1).map((d) => {
              const n = mapNgay[d] || 0;
              return (
                <div className="cb" key={d} title={`Ngày ${d}: ${n} video`}>
                  <i className={n === 0 ? 'zero' : ''} style={{ height: `${(n / maxN) * 100}%` }} />
                  <b>{d}</b>
                </div>
              );
            })}
          </div>
          <div className="legend">
            Cột cao nhất = {ngayCaoNhat?.n || 0} video. Cột xám = không tạo video. Rê chuột vào cột để xem số chính xác.
          </div>
        </div>

        <div className="panel">
          <h3>{th?.tong ?? 0} video trong {data ? tenThang(data.thang).toLowerCase() : ''} — mới nhất trước, 20 video/trang</h3>
          <table className="bang">
            <thead>
              <tr><th>Video</th><th>Ngày tạo</th><th>Trạng thái</th><th>File</th></tr>
            </thead>
            <tbody>
              {data?.jobs?.map((j) => (
                <tr key={j.id}>
                  <td>{j.title}</td>
                  <td>{ngayGio(j.created_at)}</td>
                  <td>
                    {j.status === 'done' && <span className="pill p-ok">Hoàn thành</span>}
                    {j.status === 'error' && <span className="pill p-err" title={j.error_text}>Lỗi bước {j.step || '?'}</span>}
                    {j.status === 'running' && <span className="pill p-run">Đang chạy</span>}
                    {j.status === 'queued' && <span className="pill p-wait">Chờ</span>}
                  </td>
                  <td>
                    {j.user_deleted && <span className="pill p-exp">Đã xoá tay</span>}
                    {!j.user_deleted && j.status === 'done' && !j.file_deleted && (
                      <>
                        <a className="ten" href={`/api/jobs/${j.id}/stream`} target="_blank">▶ Xem</a>
                        {' · '}
                        <a className="ten" href={`/api/jobs/${j.id}/download`}>⬇ Tải về</a>
                      </>
                    )}
                    {!j.user_deleted && j.status === 'done' && j.file_deleted && (
                      <span className="pill p-exp">Hết hạn lưu</span>
                    )}
                    {j.status !== 'done' && <span className="dim">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {data && data.so_trang > 1 && (
            <div className="pager" style={{ paddingTop: 14 }}>
              {Array.from({ length: data.so_trang }, (_, i) => i + 1).map((p) => (
                <button key={p} className={p === page ? 'cur' : ''} onClick={() => setPage(p)}>{p}</button>
              ))}
            </div>
          )}
        </div>
      </div>
    </Shell>
  );
}

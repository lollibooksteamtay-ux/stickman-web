'use client';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';

// Khung chung: menu dọc bên trái + vùng nội dung (Phương án 3 anh Tây chốt 06/08)
export default function Shell({ children, muc }) {
  const [me, setMe] = useState(null);
  const [moMenu, setMoMenu] = useState(false);
  const duong = usePathname();

  useEffect(() => {
    fetch('/api/me').then(async (r) => {
      if (r.status === 401) { window.location.href = '/login'; return; }
      setMe(await r.json());
    });
  }, []);

  async function thoat() {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/login';
  }

  const laAdmin = me?.role === 'admin';
  const dang = (id) => (muc === id ? ' on' : '');

  return (
    <div className="app">
      <aside className={`side${moMenu ? ' mo' : ''}`}>
        <a className="side-logo" href="/">🎬 Xưởng Video Viral</a>

        <div className="side-grp">Làm việc</div>
        <a className={`side-a${dang('video')}`} href="/">🎬 Video của tôi</a>

        {laAdmin && (
          <>
            <div className="side-grp">Quản trị</div>
            <a className={`side-a${dang('so-lieu')}`} href="/admin">📊 Số liệu</a>
            <a className={`side-a${dang('tat-ca')}`} href="/admin/videos">🎞 Tất cả video</a>
            <a className={`side-a${dang('nhan-vat')}`} href="/admin#nhan-vat">👥 Nhân vật</a>
            <a className={`side-a${dang('nhac')}`} href="/admin#kho-nhac">🎵 Kho nhạc</a>
            <a className={`side-a${dang('tk')}`} href="/admin#tai-khoan">👥 Tài khoản</a>
            <a className={`side-a${dang('cau-hinh')}`} href="/admin#cau-hinh">⚙️ Cấu hình</a>
          </>
        )}

        <div className="side-duoi">
          <div className="side-ten">{me?.name || me?.username || '…'}</div>
          <div className="side-vai">{laAdmin ? 'Quản trị viên' : 'Thành viên'}</div>
          <button className="side-thoat" onClick={thoat}>Đăng xuất</button>
        </div>
      </aside>

      <div className="main">
        <div className="mobile-top">
          <button className="mb-menu" onClick={() => setMoMenu(!moMenu)}>☰</button>
          <span className="logo">🎬 Xưởng Video Viral</span>
        </div>
        {children}
      </div>
      {moMenu && <div className="side-che" onClick={() => setMoMenu(false)} />}
    </div>
  );
}

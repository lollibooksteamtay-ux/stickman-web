'use client';
import { useState } from 'react';

export default function TrangDangNhap() {
  const [user, setUser] = useState('');
  const [pass, setPass] = useState('');
  const [loi, setLoi] = useState('');
  const [dangGui, setDangGui] = useState(false);

  async function dangNhap(e) {
    e.preventDefault();
    setLoi('');
    setDangGui(true);
    try {
      const r = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user, pass }),
      });
      const d = await r.json();
      if (!r.ok) {
        setLoi(d.loi || 'Đăng nhập thất bại');
        setDangGui(false);
        return;
      }
      window.location.href = '/';
    } catch {
      setLoi('Không kết nối được máy chủ');
      setDangGui(false);
    }
  }

  return (
    <div className="login-wrap">
      <form className="login-box" onSubmit={dangNhap}>
        <div className="logo">🎬 Xưởng Video Viral</div>
        <div className="mo-ta">Dán link video mẫu, nhận video người que</div>
        <label>Tên đăng nhập</label>
        <input
          type="text" value={user} required autoFocus
          placeholder="vd: tay"
          autoCapitalize="none" autoCorrect="off"
          onChange={(e) => setUser(e.target.value)}
        />
        <label>Mật khẩu</label>
        <input
          type="password" value={pass} required
          placeholder="••••••••"
          onChange={(e) => setPass(e.target.value)}
        />
        {loi && <div className="bao-loi">{loi}</div>}
        <button disabled={dangGui}>{dangGui ? 'Đang kiểm tra…' : 'Đăng nhập'}</button>
      </form>
    </div>
  );
}

import { Pool } from 'pg';

// Pool dùng chung cho mọi API route — tránh mở kết nối mới mỗi request
const globalForDb = globalThis;
export const pool =
  globalForDb.__stickmanPool ||
  new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 8,
    idleTimeoutMillis: 30_000,
  });
globalForDb.__stickmanPool = pool;

export async function q(text, params) {
  return pool.query(text, params);
}

// Đọc toàn bộ bảng settings thành object {key: value}
export async function docSettings() {
  const r = await q('SELECT key, value FROM settings');
  return Object.fromEntries(r.rows.map((x) => [x.key, x.value]));
}

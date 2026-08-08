// Nhóm nhạc nền — id trùng tên thư mục trong pipeline/assets/nhac/
export const NHOM_NHAC = [
  { id: '',           ten: 'Tự động (ngẫu nhiên)' },
  { id: 'vui-tuoi',   ten: 'Vui tươi' },
  { id: 'tram-buon',  ten: 'Trầm lắng' },
  { id: 'hao-hung',   ten: 'Hào hùng' },
  { id: 'cang-thang', ten: 'Căng thẳng / kịch tính' },
  { id: 'khong',      ten: 'Không nhạc nền' },
];
// Nhóm có thư mục thật (dùng cho upload/xoá — bỏ 'tự động' và 'không')
export const NHOM_CO_THU_MUC = NHOM_NHAC.filter((n) => n.id && n.id !== 'khong');
export function laNhomHopLe(id) {
  return NHOM_NHAC.some((n) => n.id === id);
}

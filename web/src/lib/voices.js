// Kho giọng — id là tên prebuilt voice của Gemini TTS.
// "chidan" được nhét vào chỉ dẫn đọc (PHONG_CACH_DOC) để lái chất giọng.
export const GIONG_DOC = [
  { id: 'Charon', ten: 'Quân',  mo_ta: 'Nam · miền Bắc',  chidan: 'giọng nam miền Bắc chuẩn (Hà Nội)' },
  { id: 'Kore',   ten: 'Ngọc',  mo_ta: 'Nữ · miền Bắc',   chidan: 'giọng nữ miền Bắc chuẩn (Hà Nội)' },
  { id: 'Puck',   ten: 'Phúc',  mo_ta: 'Nam · miền Nam',  chidan: 'giọng nam miền Nam (Sài Gòn)' },
  { id: 'Leda',   ten: 'Thảo',  mo_ta: 'Nữ · miền Nam',   chidan: 'giọng nữ miền Nam (Sài Gòn)' },
  { id: 'Fenrir', ten: 'Tuấn',  mo_ta: 'Nam · sôi nổi',   chidan: 'giọng nam trẻ sôi nổi, giàu năng lượng' },
  { id: 'Zephyr', ten: 'Mai',   mo_ta: 'Nữ · sáng tươi',  chidan: 'giọng nữ sáng, tươi tắn' },
  { id: 'Aoede',  ten: 'Thu',   mo_ta: 'Nữ · nhẹ nhàng',  chidan: 'giọng nữ nhẹ nhàng êm' },
];
// Thị trường Campuchia: đúng 4 giọng (anh Tây chốt 11/08) — id vẫn là prebuilt voice Gemini,
// "chidan" tiếng Anh nhét vào lệnh đọc để lái tuổi + chất giọng.
export const GIONG_KH = [
  { id: 'Puck',   ten: 'Dara',    mo_ta: 'Nam · trẻ',             chidan: 'an energetic Cambodian young man in his early 20s, bright lively voice' },
  { id: 'Leda',   ten: 'Bopha',   mo_ta: 'Nữ · trẻ',              chidan: 'a cheerful Cambodian young woman in her early 20s, clear friendly voice' },
  { id: 'Charon', ten: 'Sovann',  mo_ta: 'Nam · đứng tuổi 45-55', chidan: 'a calm Cambodian man around 50 years old, deep warm steady voice' },
  { id: 'Kore',   ten: 'Sreymom', mo_ta: 'Nữ · đứng tuổi 45-55',  chidan: 'a composed Cambodian woman around 50 years old, warm firm trustworthy voice' },
];
export function dsGiongTheoThiTruong(tt) {
  return tt === 'kh' ? GIONG_KH : GIONG_DOC;
}
export const GIONG_MAC_DINH = 'Charon';
export function laGiongHopLe(id) {
  return GIONG_DOC.some((g) => g.id === id);
}

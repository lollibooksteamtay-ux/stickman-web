import './globals.css';

const TEN = 'Xưởng Video Viral';
const MO_TA = 'Bạn dán link — xưởng lo hết: kịch bản, hình vẽ, giọng đọc, phụ đề, nhạc nền, ảnh bìa. '
  + 'Việc của bạn chỉ là tải video về và đăng.';
const WEB = 'https://ai.studio.richbooks.asia';

export const metadata = {
  metadataBase: new URL(WEB),
  title: `${TEN} — dán link, nhận video hoàn chỉnh`,
  description: MO_TA,
  keywords: [
    'tạo video người que', 'video stickman tiếng Việt', 'làm video TikTok tự động',
    'AI tạo video ngắn', 'video Reels Shorts tự động', 'xưởng video viral',
  ],
  applicationName: TEN,
  openGraph: {
    type: 'website',
    siteName: TEN,
    locale: 'vi_VN',
    url: WEB,
    title: `${TEN} — dán link, nhận video hoàn chỉnh`,
    description: MO_TA,
    images: [{ url: '/og.jpg', width: 1200, height: 630, alt: TEN }],
  },
  twitter: {
    card: 'summary_large_image',
    title: `${TEN} — dán link, nhận video hoàn chỉnh`,
    description: MO_TA,
    images: ['/og.jpg'],
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}

import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '일일 인원현황 보고문 생성기',
  description: 'Supabase 기반 군 부대 일일 인원/열외현황 보고문 자동 생성 MVP',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}

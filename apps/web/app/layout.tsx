import type { Metadata } from "next";
import { Gothic_A1, IBM_Plex_Sans_KR } from "next/font/google";
import "./globals.css";

// 한글 글리프는 unicode-range로 필요할 때 받으므로 latin만 preload
const gothic = Gothic_A1({ weight: ["500", "700", "900"], subsets: ["latin"], variable: "--font-gothic-a1" });
const plex = IBM_Plex_Sans_KR({ weight: ["400", "500", "600", "700"], subsets: ["latin"], variable: "--font-plex-kr" });

export const metadata: Metadata = {
  title: "채비 — 첫 집 마련 AI 길잡이",
  description: "재정 상황과 희망 조건으로 구매 가능 예산을 계산하고 주택 후보를 비교하는 AI 서비스",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ko"
      className={`${gothic.variable} ${plex.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}

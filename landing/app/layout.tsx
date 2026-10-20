import type { Metadata, Viewport } from "next";
import { Black_Han_Sans, Noto_Sans_KR } from "next/font/google";
import { isProductionSite, normalizeSiteUrl } from "../lib/site";
import "./globals.css";

const body = Noto_Sans_KR({ weight: ["400", "500", "700", "800"], subsets: ["latin"], display: "swap", variable: "--font-body", preload: false });
const display = Black_Han_Sans({ weight: "400", subsets: ["latin"], display: "swap", variable: "--font-display", preload: false });

const SITE = normalizeSiteUrl(process.env.NEXT_PUBLIC_SITE_URL);

const TITLE = "상권분석 — 내 가게가 있는 상권, 지금 어느 수준일까요?";
const DESC = "자영업자와 예비 창업자를 위한 상권분석. 공식 통계로 매출·경쟁·입지·영업 안정성을 지도에서 보고, 내 가게와 견주고, 인사이트 리포트로 정리하세요.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: TITLE,
  description: DESC,
  alternates: { canonical: "/" },
  // 실제 주소로 배포하기 전(로컬·미리보기)에는 검색에 잡히지 않게 한다
  robots: isProductionSite(SITE) ? { index: true, follow: true } : { index: false, follow: false },
  openGraph: { title: TITLE, description: DESC, type: "website", locale: "ko_KR", url: "/", siteName: "상권분석" },
  twitter: { card: "summary", title: TITLE, description: DESC },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#f5f7fa" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" className={`${body.variable} ${display.variable}`}>
      <body>{children}</body>
    </html>
  );
}

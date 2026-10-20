import { appLink, normalizeAppUrl } from "../lib/links";

const APP_URL = normalizeAppUrl(process.env.NEXT_PUBLIC_APP_URL);

export default function NotFound() {
  return (
    <main className="wrap" style={{ paddingBlock: "clamp(64px, 14vw, 160px)", textAlign: "center" }}>
      <p className="eyebrow">404</p>
      <h1 className="h2" style={{ marginTop: 8 }}>찾는 페이지가 없어요</h1>
      <p className="lead" style={{ margin: "14px auto 28px" }}>주소가 바뀌었거나 잘못 입력됐을 수 있어요. 처음 화면으로 돌아가거나 바로 지도를 열어 보세요.</p>
      <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
        <a className="btn" href="/">처음으로</a>
        <a className="btn primary" href={appLink(APP_URL, "owner")}>지도 열기</a>
      </div>
    </main>
  );
}

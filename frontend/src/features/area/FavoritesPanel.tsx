import { useState } from "react";
import { MAX_FAVORITES, favKey, type FavoriteArea } from "../../lib/favorites";
import { OVERLAY_Z_INDEX } from "../../lib/vizConfig";

interface Props {
  favorites: FavoriteArea[];
  /** 담을 때 보던 업종 코드 → 이름(모르면 코드를 보이지 않고 '외식 전체'로 둔다) */
  industryName: (svc: string | null, scls: string | null) => string;
  /** 비교 목록에 이 지역을 담을 수 있는가(단위가 다르면 이유 문구, 담을 수 있으면 null) */
  compareBlock: (f: FavoriteArea) => string | null;
  /** 이 지역을 공유할 때 쓸 주소 — 모드·단위·지역 코드·업종 코드만 든다 */
  shareUrl: (f: FavoriteArea) => string;
  narrow: boolean;
  onOpen: (f: FavoriteArea) => void;
  onCompare: (f: FavoriteArea) => void;
  onRemove: (f: FavoriteArea) => void;
  onClose: () => void;
}

/** 관심 지역 목록 — 이 브라우저에만 저장된 지역을 다시 열거나 비교에 담고, 공유 주소를 복사한다. */
export function FavoritesPanel(p: Props) {
  const [shown, setShown] = useState<{ key: string; url: string; copied: boolean } | null>(null);
  const share = async (f: FavoriteArea) => {
    const url = p.shareUrl(f);
    let copied = false;
    try {
      await navigator.clipboard.writeText(url);
      copied = true;
    } catch {
      /* 클립보드를 못 쓰면 아래 입력칸에서 직접 복사한다 */
    }
    setShown({ key: favKey(f), url, copied });
  };
  return (
    <div
      role="dialog"
      aria-label="관심 지역"
      style={{ position: "absolute", zIndex: OVERLAY_Z_INDEX + 2, top: 62, right: p.narrow ? 8 : 16, left: p.narrow ? 8 : "auto", width: p.narrow ? "auto" : 340, maxHeight: "calc(100% - 80px)", overflowY: "auto", background: "white", border: "1px solid #E5E7EB", borderRadius: 10, boxShadow: "0 4px 16px rgba(0,0,0,0.18)", padding: 12, fontSize: 15 }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <strong>관심 지역 {p.favorites.length}/{MAX_FAVORITES}</strong>
        <button type="button" onClick={p.onClose} aria-label="관심 지역 닫기" style={{ border: "none", background: "none", cursor: "pointer", fontSize: 20, color: "#6B7280" }}>×</button>
      </div>
      <div style={{ fontSize: 12.5, color: "#6B7280", margin: "2px 0 8px" }}>이 브라우저에만 저장되며 계정·서버로 보내지 않습니다. 공유 주소에는 모드·지역·업종 코드만 들어갑니다.</div>
      {p.favorites.length === 0 && <div style={{ color: "#6B7280", fontSize: 13 }}>아직 없습니다. 상권·행정동 종합분석에서 '관심 지역에 담기'를 누르세요.</div>}
      <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
        {p.favorites.map((f) => {
          const block = p.compareBlock(f);
          const key = favKey(f);
          return (
            <li key={key} style={{ border: "1px solid #E5E7EB", borderRadius: 8, padding: "8px 10px" }}>
              <div style={{ fontWeight: 600 }}>{f.name} <span style={{ fontWeight: 400, fontSize: 12.5, color: "#6B7280" }}>{f.type ?? (f.level === "dong" ? "행정동" : "상권")} · {p.industryName(f.svc, f.scls)}</span></div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
                <MiniBtn primary onClick={() => p.onOpen(f)}>다시 열기</MiniBtn>
                <MiniBtn onClick={() => p.onCompare(f)} disabled={block !== null} title={block ?? undefined}>비교에 담기</MiniBtn>
                <MiniBtn onClick={() => void share(f)}>공유 링크</MiniBtn>
                <MiniBtn onClick={() => p.onRemove(f)} danger>삭제</MiniBtn>
              </div>
              {block && <div style={{ fontSize: 12, color: "#B45309", marginTop: 2 }}>{block}</div>}
              {shown?.key === key && (
                <div style={{ marginTop: 6 }}>
                  <div role="status" style={{ fontSize: 12.5, color: shown.copied ? "#047857" : "#92400E" }}>{shown.copied ? "링크를 복사했습니다." : "자동 복사가 막혀 있어요. 아래 주소를 직접 복사하세요."}</div>
                  <input readOnly value={shown.url} aria-label="공유 주소" onFocus={(e) => e.currentTarget.select()} style={{ width: "100%", boxSizing: "border-box", fontSize: 12.5, padding: "3px 6px", border: "1px solid #D1D5DB", borderRadius: 4 }} />
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function MiniBtn({ children, onClick, primary, danger, disabled, title }: { children: string; onClick: () => void; primary?: boolean; danger?: boolean; disabled?: boolean; title?: string }) {
  const color = danger ? "#991B1B" : primary ? "#1D4ED8" : "#374151";
  return (
    <button type="button" onClick={onClick} disabled={disabled} title={title} style={{ padding: "3px 9px", border: `1px solid ${disabled ? "#E5E7EB" : danger ? "#FCA5A5" : primary ? "#3B82F6" : "#D1D5DB"}`, borderRadius: 6, background: "white", color: disabled ? "#9CA3AF" : color, cursor: disabled ? "not-allowed" : "pointer", fontSize: 13 }}>
      {children}
    </button>
  );
}

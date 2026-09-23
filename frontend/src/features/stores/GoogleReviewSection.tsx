import { useEffect, useRef, useState } from "react";
import { Notice, Section } from "../../components/Notice";
import { googleBrowserKeyConfigured, GoogleNotConfigured, loadGooglePlacesUiKit } from "../../lib/googleMapsLoader";
import { useGooglePlaceLink } from "./useStores";

/** 'Google 고객평가' — 사용자가 열 때만 이 매장 1곳을 조회한다. 평점·리뷰는 Google 공식 컴포넌트가 그대로 표시하고,
 * 우리 쪽에서 점수화·순위화·저장하지 않는다. */
export function GoogleReviewSection({ storeId }: { storeId: string }) {
  const [open, setOpen] = useState(false);
  const link = useGooglePlaceLink(storeId, open);

  return (
    <Section
      title="Google 고객평가"
      right={
        !open && (
          <button type="button" onClick={() => setOpen(true)} style={buttonStyle}>
            불러오기
          </button>
        )
      }
    >
      {!open && <div style={{ fontSize: 12, color: "#6B7280" }}>눌렀을 때만 이 매장의 Google 장소를 확인합니다.</div>}
      {open && link.isLoading && <Notice tone="muted">Google 장소를 확인하는 중...</Notice>}
      {open && link.isError && <Notice tone="error">조회 실패 — 서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.</Notice>}
      {open && link.data && <LinkResult status={link.data.status} message={link.data.message} placeId={link.data.place_id} />}
    </Section>
  );
}

function LinkResult({ status, message, placeId }: { status: string; message: string; placeId: string | null }) {
  if (status === "matched" && placeId) {
    if (!googleBrowserKeyConfigured()) return <Notice tone="pending">연동 준비 중 — Google 지도 표시용 키가 설정되지 않았습니다.</Notice>;
    return <GooglePlaceDetails placeId={placeId} />;
  }
  if (status === "not_configured") return <Notice tone="pending">{message}</Notice>;
  if (status === "api_error") return <Notice tone="error">{message}</Notice>;
  return <Notice tone="warn">{message}</Notice>;
}

type ElementState = "loading" | "ready" | "no_rating" | "error" | "not_configured";

function GooglePlaceDetails({ placeId }: { placeId: string }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<ElementState>("loading");

  useEffect(() => {
    let cancelled = false;
    const host = hostRef.current;
    loadGooglePlacesUiKit()
      .then(() => {
        if (cancelled || !host) return;
        const el = document.createElement("gmp-place-details");
        const req = document.createElement("gmp-place-details-place-request");
        req.setAttribute("place", placeId);
        const cfg = document.createElement("gmp-place-content-config");
        for (const tag of ["gmp-place-rating", "gmp-place-reviews", "gmp-place-attribution"]) cfg.appendChild(document.createElement(tag));
        el.append(req, cfg);
        el.addEventListener("gmp-error", () => !cancelled && setState("error"));
        el.addEventListener("gmp-load", () => {
          if (cancelled) return;
          // 평점 없는 장소를 컴포넌트가 어떻게 보여주는지 실제 키로 확인하지 못해, 로드된 place 기준으로 안내를 덧붙인다(값은 저장하지 않음).
          const place = (el as unknown as { place?: { rating?: number | null; userRatingCount?: number | null } }).place;
          setState(place && "rating" in place && place.rating == null && !place.userRatingCount ? "no_rating" : "ready");
        });
        host.replaceChildren(el);
      })
      .catch((e) => !cancelled && setState(e instanceof GoogleNotConfigured ? "not_configured" : "error"));
    return () => {
      cancelled = true;
      host?.replaceChildren();
    };
  }, [placeId]);

  return (
    <div>
      {state === "loading" && <Notice tone="muted">Google 고객평가를 불러오는 중...</Notice>}
      {state === "error" && <Notice tone="error">Google 조회 실패 — 잠시 후 다시 시도해 주세요.</Notice>}
      {state === "not_configured" && <Notice tone="pending">연동 준비 중</Notice>}
      {state === "no_rating" && <Notice tone="muted">고객평가 정보 없음</Notice>}
      {/* 비Google 지도와 함께 쓸 때는 Google 콘텐츠를 테두리 등으로 시각적으로 구분해야 한다(서비스 약관). */}
      <div ref={hostRef} style={{ border: "1px solid #D1D5DB", borderRadius: 8, overflow: "hidden", marginTop: 6 }} />
    </div>
  );
}

const buttonStyle = {
  padding: "4px 10px",
  borderRadius: 6,
  border: "1px solid #3B82F6",
  background: "white",
  color: "#3B82F6",
  fontSize: 12,
  cursor: "pointer",
} as const;

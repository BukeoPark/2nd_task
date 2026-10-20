// 튜토리얼이 접힌 영역(<details>) 안의 대상을 가리키려고 펼친 것을, 그 단계가 끝나면 원래대로 되돌린다.
//  · 원래부터 열려 있던 영역은 건드리지 않는다(우리가 펼친 것만 기록한다).
//  · 튜토리얼 중에 사용자가 직접 열고 닫은 영역은 덮어쓰지 않는다 — 다시 펼치지도, 되돌리지도 않는다.
// 접힘 상태를 가진 요소의 최소 모양(FoldLike)만 쓰는 순수 로직이라 DOM 없이 테스트한다(tests/tourFolds.test.ts).

export interface FoldLike {
  open: boolean;
  addEventListener(type: "toggle", fn: () => void): void;
  removeEventListener(type: "toggle", fn: () => void): void;
}

interface Rec { own: boolean; touched: boolean; onToggle: () => void }
export type FoldLog = Map<FoldLike, Rec>;

/** 대상이 접힌 영역 안에 있으면 펼친다. 이미 열려 있거나 사용자가 이 튜토리얼 중에 직접 만진 영역은 그대로 둔다. */
export function expandForTour(fold: FoldLike, log: FoldLog): void {
  if (fold.open) return;
  const known = log.get(fold);
  if (known?.touched) return;
  let rec = known;
  if (!rec) {
    const r: Rec = { own: false, touched: false, onToggle: () => { if (r.own) r.own = false; else r.touched = true; } };
    fold.addEventListener("toggle", r.onToggle);
    log.set(fold, r);
    rec = r;
  }
  rec.own = true; // 우리가 펼쳐서 생기는 toggle 은 사용자의 조작으로 세지 않는다
  fold.open = true;
}

/** 우리가 펼치고 사용자가 만지지 않은 영역만 다시 접고 기록을 비운다. */
export function restoreFolds(log: FoldLog): void {
  for (const [fold, rec] of log) {
    fold.removeEventListener("toggle", rec.onToggle);
    if (!rec.touched && fold.open) {
      fold.open = false;
    }
  }
  log.clear();
}

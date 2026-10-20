// 전체 화면 작업창(비교·내 관심 지역·보고서·비용 점검·월간 점검)을 열 때 브라우저 기록에 한 칸을 쌓고, 브라우저 '뒤로'가 그 창을 닫게 한다.
// 열린 창은 위에 쌓인 순서(레벨)대로만 닫힌다 — 뒤로 가기를 한 번 누르면 가장 위의 창 하나가 닫힌다. 앞으로 가기는 창을 다시 열지 않는다(자료가 사라졌을 수 있어서).
//  · 화면의 '← 뒤로' 단추·Esc 는 requestClose 로 같은 길(history.back)을 간다 → 단추와 브라우저 뒤로가 늘 같은 결과.
//  · 부모가 창을 직접 닫는 경우(다른 화면으로 이동)는 forget 으로 기록 칸의 표시만 지운다(되감지 않음 — 이어지는 화면 이동과 엉키지 않게).
//  · 기록에 해당 칸이 없으면(직접 접속·새로고침 뒤 등) 창을 그냥 닫는다 — 안전한 기본 화면으로.
// 환경(window)을 주입해 DOM 없이 테스트한다(tests/overlayHistory.test.ts).

export interface HistoryLike {
  state: unknown;
  pushState(state: unknown, title: string, url?: string): void;
  replaceState(state: unknown, title: string, url?: string): void;
  back(): void;
}
export interface EnvLike {
  history: HistoryLike;
  location: { href: string };
  addEventListener(type: "popstate", fn: () => void): void;
  removeEventListener(type: "popstate", fn: () => void): void;
}

type Base = Record<string, unknown>;
const baseOf = (s: unknown): Base => (s && typeof s === "object" ? { ...(s as Base) } : {});
const levelOf = (s: unknown): number => (s && typeof s === "object" && typeof (s as Base).ov === "number" ? ((s as Base).ov as number) : 0);

export class OverlayHistory {
  private levels = new Map<number, () => void>();
  private readonly onPop = () => {
    const now = levelOf(this.env.history.state);
    for (const lv of [...this.levels.keys()].sort((a, b) => b - a)) {
      if (lv > now) {
        const close = this.levels.get(lv);
        this.levels.delete(lv);
        close?.();
      }
    }
  };
  private readonly env: EnvLike;
  constructor(env: EnvLike) {
    this.env = env;
    env.addEventListener("popstate", this.onPop);
  }

  /** 창을 열 때 — 기록 한 칸을 쌓고 레벨을 돌려준다. onClose 는 브라우저 뒤로로 닫힐 때 불린다. */
  open(onClose: () => void): number {
    const level = this.levels.size === 0 ? 1 : Math.max(...this.levels.keys()) + 1;
    this.levels.set(level, onClose);
    this.env.history.pushState({ ...baseOf(this.env.history.state), ov: level }, "", this.env.location.href);
    return level;
  }

  /** 사용자가 닫을 때(← 뒤로·Esc) — 가장 위 창이면 history.back(), 아니면(기록에 칸이 없으면) 바로 닫는다. */
  requestClose(level: number): void {
    const close = this.levels.get(level);
    if (!close) return;
    if (levelOf(this.env.history.state) === level) {
      this.env.history.back();   // popstate → onPop → close
      return;
    }
    this.levels.delete(level);
    close();
  }

  /** 부모가 창을 직접 닫을 때 — 되감지 않고 기록 칸의 창 표시만 지운다. */
  forget(level: number): void {
    if (!this.levels.delete(level)) return;
    if (levelOf(this.env.history.state) === level) {
      const base = baseOf(this.env.history.state);
      delete base.ov;
      this.env.history.replaceState(base, "", this.env.location.href);
    }
  }

  /** 지금 열린 창 중 가장 위인가(Esc 는 가장 위 창만 닫는다) */
  isTop(level: number): boolean {
    return this.levels.has(level) && Math.max(...this.levels.keys()) === level;
  }

  get depth(): number { return this.levels.size; }
}

/** 브라우저 환경의 하나뿐인 인스턴스(window 가 없으면 null). */
export const overlays: OverlayHistory | null = typeof window !== "undefined" ? new OverlayHistory(window as unknown as EnvLike) : null;

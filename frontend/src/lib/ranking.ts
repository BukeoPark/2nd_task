// 지도 버블을 지표 값 순서로 세운 순위표 — 지도를 눌러야만 열리는 정보를 표(키보드·스크린리더)로도 볼 수 있게 한다.
// 다른 모듈을 import 하지 않는 순수 함수(tests/ranking.test.ts).

export interface RankInput {
  code: string;
  name: string;
  size: number | null; // 점포 수
  value: number | null; // 지표 값(없으면 null = 0 이 아니라 자료 없음)
}

export interface RankedRow<T extends RankInput> {
  /** 같은 값은 같은 순위(1, 2, 2, 4). 값이 없으면 순위를 매기지 않는다. */
  rank: number | null;
  item: T;
}

function cmpDesc(a: number | null, b: number | null): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1; // 값이 없는 쪽은 맨 아래
  if (b === null) return -1;
  return b - a;
}

/** 값 큰 순. 같은 값은 점포 수가 많은 순, 그다음 이름 순. 입력 배열은 바꾸지 않는다. */
export function rankBubbles<T extends RankInput>(items: T[]): RankedRow<T>[] {
  const sorted = [...items].sort((a, b) => cmpDesc(a.value, b.value) || cmpDesc(a.size, b.size) || a.name.localeCompare(b.name, "ko"));
  const rows: RankedRow<T>[] = [];
  sorted.forEach((item, i) => {
    if (item.value === null) return void rows.push({ rank: null, item });
    const prev = rows[i - 1];
    rows.push({ rank: prev && prev.item.value === item.value && prev.rank !== null ? prev.rank : i + 1, item });
  });
  return rows;
}

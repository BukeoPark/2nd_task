// 서버가 주는 긴 안내 문구를 화면에서는 첫 문장만 보인다 — 나머지 설명은 접힌 유의사항이나 보고서에 있다. 다른 모듈을 import 하지 않는 순수 함수(tests/shortText.test.ts).

/** 첫 문장(마침표·물음표·느낌표 뒤 공백 기준)만. 문장이 하나뿐이거나 비어 있으면 그대로 돌려준다. */
export function firstSentence(text: string | null | undefined): string {
  const t = (text ?? "").trim();
  const m = /^.+?[.!?。](?=\s|$)/s.exec(t);
  return m ? m[0] : t;
}

import { useState } from "react";
import { clearRecord, loadRecord, saveRecord, type StoreRecord } from "../../lib/myStoreStorage";

/** 내 가게 기록(월 매출·비용)의 단일 출처 — 매장 상세가 한 번만 들고 있고, 입력은 '내 가게 점검'에서만 받는다.
 * 저장은 이 브라우저(localStorage)에만 하며, 저장이 막히면 saveFailed 로 알린다(화면은 계속 쓸 수 있다). */
export function useMyStoreRecord(storeId: string) {
  const [record, setRecord] = useState<StoreRecord>(() => loadRecord(storeId));
  const [saveFailed, setSaveFailed] = useState(false);
  const update = (next: StoreRecord) => {
    setRecord(next);
    setSaveFailed(!saveRecord(storeId, next));
  };
  const reset = () => {
    clearRecord(storeId);
    setRecord(loadRecord(storeId));
    setSaveFailed(false);
  };
  return { record, update, reset, saveFailed };
}

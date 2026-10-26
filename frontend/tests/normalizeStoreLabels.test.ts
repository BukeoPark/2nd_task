import test from "node:test";
import assert from "node:assert/strict";
import { normalizeStoreLabels } from "../src/lib/normalizeStoreLabels.ts";
test("검색·상세·목록이 같은 상호를 쓰며 원본 응답을 수정하지 않는다", () => {
  const source = { records: [{ store_id: "new-store", name: "이디야영등포아크로", branch: "타워점" }], unit: { name: "영등포동" }, value: null };
  const result = normalizeStoreLabels(source);
  assert.deepEqual(result.records[0], { store_id: "new-store", name: "이디야", branch: "영등포아크로타워점" });
  assert.equal(source.records[0].name, "이디야영등포아크로");
  assert.equal(result.unit.name, "영등포동"); assert.equal(result.value, null);
});
test("감사 대상 매장의 검색 이름에도 분리 결과를 적용한다", () => {
  const row = normalizeStoreLabels({ store_id: "MA0101202509A0010595", name: "금돈정영등포역점", kind: "store" });
  assert.equal(row.name, "금돈정 영등포역점");
});

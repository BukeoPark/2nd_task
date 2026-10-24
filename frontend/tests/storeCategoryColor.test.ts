import assert from "node:assert/strict";
import {test} from "node:test";
import {storeCategoryColor,storeCategoryLegend} from "../src/lib/storeCategoryColor.ts";
test("세부 업종 범례는 개수 내림차순이며 입력 순서와 무관하다",()=>{
 const points=[{category:"파스타/스테이크"},{category:"경양식"},{category:"기타 서양식 음식점"},{category:"경양식"}];
 const out=storeCategoryLegend(points);assert.equal(out[0].name,"경양식");assert.equal(out[0].count,2);assert.deepEqual(out,storeCategoryLegend([...points].reverse()));
});
test("같은 분류 목록은 순서가 달라도 같은 색이며 분류끼리 색이 겹치지 않는다",()=>{
 const names=["경양식","파스타/스테이크","기타 서양식 음식점","패밀리레스토랑","백반/한정식","카페","국/탕/찌개류"];
 const colors=names.map(n=>storeCategoryColor(n,names));assert.equal(new Set(colors).size,names.length);
 assert.deepEqual(colors,names.map(n=>storeCategoryColor(n,[...names].reverse())));
});

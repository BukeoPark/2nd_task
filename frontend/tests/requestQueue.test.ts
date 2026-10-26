import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequestQueue } from "../src/lib/requestQueue.ts";
test("동시 조회 상한을 지키며 실패 뒤 대기 요청도 진행한다", async () => {
 const run = createRequestQueue(2);
 let active=0, maximum=0;
 const results=await Promise.allSettled(Array.from({length:8},(_,i)=>run(async()=>{
  active++;maximum=Math.max(maximum,active);
  await new Promise(resolve=>setTimeout(resolve,5));
  active--;
  if(i===2) throw new Error("조회 실패");
  return i;
 })));
 assert.equal(maximum,2);
 assert.equal(results.filter(x=>x.status==="fulfilled").length,7);
 assert.equal(await run(async()=>"재시도"),"재시도");
});

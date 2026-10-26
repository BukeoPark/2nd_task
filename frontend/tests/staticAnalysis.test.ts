import {test} from "node:test";
import assert from "node:assert/strict";
import {canonicalRequest,createStaticAnalysisReader,combineComparisons} from "../src/lib/staticAnalysis.ts";
test("쿼리 순서·빈 물음표를 정규화한다",()=>{
 assert.equal(canonicalRequest("/api/x?svc=A&level=dong"),"/api/x?level=dong&svc=A");
 assert.equal(canonicalRequest("/api/x?"),"/api/x");
});
test("같은 묶음을 한 번만 읽고 미지원 조건은 서버로 넘긴다",async()=>{
 const calls:string[]=[];
 const read=createStaticAnalysisReader(async p=>{calls.push(p);return p.includes("manifest")?{routes:{"/api/a":"part.json","/api/b":"part.json"}}:{"/api/a":{value:0},"/api/b":{value:null}};});
 assert.deepEqual(await read("/api/a"),{value:0});
 assert.deepEqual(await read("/api/b"),{value:null});
 assert.equal(await read("/api/unknown"),undefined);
 assert.equal(calls.length,2);
});
test("동일 기준의 비교값만 결합하고 서로 다른 기준기간은 서버로 넘긴다",()=>{
 const a={units:[{code:"a"}],rows:[{key:"sales",as_of:"20262",cells:[{value:1}]}]};
 const b={units:[{code:"b"}],rows:[{key:"sales",as_of:"20262",cells:[{value:2}]}]};
 assert.equal(combineComparisons([a,b])?.units.length,2);
 assert.deepEqual(combineComparisons([a,b])?.rows[0].cells,[{value:1},{value:2}]);
 assert.equal(combineComparisons([a,{...b,rows:[{...b.rows[0],as_of:"20261"}]}]),undefined);
});

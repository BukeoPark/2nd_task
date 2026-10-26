import { readFileSync, writeFileSync } from "node:fs";
import { splitStoreName } from "../src/lib/storeName.ts";
const output = process.argv[2];
const rows = JSON.parse(readFileSync(`${output}/source-names.json`, "utf8"));
const changed: any[] = [], unresolved: any[] = [];
const overrides: Record<string, { name: string; branch: string | null }> = {};
for (const row of rows) {
  const display = splitStoreName(row.name, row.branch);
  if (display.name !== row.name || display.branch !== row.branch) {
    changed.push({ ...row, display }); overrides[row.store_id] = display;
  }
  if (row.food && !display.branch && /점(?:주)?$/.test(row.name)) unresolved.push(row);
}
writeFileSync("src/lib/storeDisplayNames.json", JSON.stringify(overrides, null, 2)+"\n");
writeFileSync(`${output}/changed-names.json`, JSON.stringify(changed, null, 2));
writeFileSync(`${output}/unresolved-names.json`, JSON.stringify(unresolved, null, 2));
console.log(JSON.stringify({ scanned: rows.length, food: rows.filter((r:any)=>r.food).length,
  changed: changed.length, changedFood: changed.filter(r=>r.food).length, unresolved: unresolved.length }));
console.log(JSON.stringify(unresolved.map(r=>[r.name,r.branch]).slice(0,160)));

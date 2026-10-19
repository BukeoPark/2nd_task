import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { FORBIDDEN } from "../src/lib/terms.ts";

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? sourceFiles(p) : /\.(ts|tsx)$/.test(n) ? [p] : [];
  });
}
/** 주석은 빼고 화면에 나가는 문구만 본다. */
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\s\/\/ .*$/gm, "");

test("화면 문구에 쓰지 않기로 한 표기가 없다(용어 통일)", () => {
  const found: string[] = [];
  for (const f of sourceFiles("src")) {
    if (f.endsWith("terms.ts")) continue;
    const text = code(readFileSync(f, "utf8"));
    for (const bad of Object.keys(FORBIDDEN)) if (text.includes(bad)) found.push(`${f}: '${bad}' → '${FORBIDDEN[bad]}'`);
  }
  assert.deepEqual(found, []);
});

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "vitest";
import { fileURLToPath } from "node:url";
import { storage as shellStorage } from "./storage";
import { projectChatOpen } from "./storageKeys";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
/** 画面のソースの根（画面の土台・組み立て・各機能の ui） */
const roots = [
  "src/foundation/ui",
  "src/app/renderer",
  ...fs.readdirSync(path.join(repo, "src/features")).map((f) => `src/features/${f}/ui`),
]
  .map((r) => path.join(repo, r))
  .filter((r) => fs.existsSync(r));

/** 画面のソース（テストを除く） */
function sources(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) return sources(file);
    return /\.tsx?$/.test(entry.name) && !entry.name.endsWith(".test.ts") ? [file] : [];
  });
}

test("保存は機能・土台の storage.ts の defineSettings で宣言する（ほかで宣言すると、起動したときの片付けに渡す群に入らず、キーが消える）", () => {
  const files = roots.flatMap(sources);
  const single = files.filter((file) => !/storage[\\/](storageKeys|settings|groups)\.ts$/.test(file) && /\bdefineSetting(Family)?\(/.test(fs.readFileSync(file, "utf8")));
  assert.deepEqual(single.map((f) => path.relative(repo, f)), []);
  const groups = files.filter((file) => !/[\\/](storage|groups)\.ts$/.test(file) && /\bdefineSettings\(/.test(fs.readFileSync(file, "utf8")));
  assert.deepEqual(groups.map((f) => path.relative(repo, f)), []);
});

test("localStorage・sessionStorage は storage/settings.ts の外で直接読み書きしない（値がそろわなくなる）", () => {
  const direct = roots.flatMap(sources).filter((file) => {
    if (/(storage[\\/]settings|testing[\\/]memoryStorage)\.ts$/.test(file)) return false;
    // コメントの中の言葉は数えない
    const code = fs.readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
    return /\b(localStorage|sessionStorage)\b/.test(code);
  });
  assert.deepEqual(direct.map((f) => path.relative(repo, f)), []);
});

test("宣言: ID を含むもの（チャット・グループ・下書き）には印があり、含まないもの（テーマ・DB の ID）にはない", () => {
  assert.equal(projectChatOpen(1).ids, true);
  assert.equal(shellStorage.settings.lastRoute.ids, true);
  assert.equal(shellStorage.settings.theme.ids, false);
  assert.equal(shellStorage.settings.databaseId.ids, false);
});

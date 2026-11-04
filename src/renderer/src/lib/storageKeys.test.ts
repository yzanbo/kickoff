import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { DATABASE_ID, chatDraft, NEW_CHAT_DRAFTS, sidebarGroupClosed, THEME } from "./storageKeys";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** 画面のソース（テストを除く） */
function sources(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) return sources(file);
    return /\.tsx?$/.test(entry.name) && !entry.name.endsWith(".test.ts") ? [file] : [];
  });
}

test("保存するものは storageKeys.ts でだけ宣言する（ほかで宣言すると、起動したときの片付けがその宣言を知らずにキーを消す）", () => {
  const outside = sources(root).filter((file) => {
    if (file.endsWith(path.join("lib", "storageKeys.ts")) || file.endsWith(path.join("lib", "storage.ts"))) return false;
    return /\bdefineSetting(Family)?\(/.test(fs.readFileSync(file, "utf8"));
  });
  assert.deepEqual(outside.map((f) => path.relative(root, f)), []);
});

test("localStorage・sessionStorage は lib/storage.ts の外で直接読み書きしない（値がそろわなくなる）", () => {
  const direct = sources(root).filter((file) => {
    if (/lib[\\/](storage|memoryStorage)\.ts$/.test(file)) return false;
    // コメントの中の言葉は数えない
    const code = fs.readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
    return /\b(localStorage|sessionStorage)\b/.test(code);
  });
  assert.deepEqual(direct.map((f) => path.relative(root, f)), []);
});

test("宣言: ID を含むもの（チャット・グループ・下書き）には印があり、含まないもの（テーマ・DB の ID）にはない", () => {
  assert.equal(chatDraft(1).ids, true);
  assert.equal(sidebarGroupClosed.ids, true);
  assert.equal(NEW_CHAT_DRAFTS.ids, true);
  assert.equal(THEME.ids, false);
  assert.equal(DATABASE_ID.ids, false);
});

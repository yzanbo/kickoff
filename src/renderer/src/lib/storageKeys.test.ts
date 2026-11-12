import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { DATABASE_ID, chatAttachmentsDraft, chatDraft, FOLDS, NEW_CHAT_DRAFTS, THEME } from "./storageKeys";

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
  assert.equal(chatAttachmentsDraft(1).ids, true);
  assert.equal(FOLDS.ids, true);
  assert.equal(NEW_CHAT_DRAFTS.ids, true);
  assert.equal(THEME.ids, false);
  assert.equal(DATABASE_ID.ids, false);
});

test("送る前の添付: 形の合う添付だけを読み（種類を持つ前の形は読み替える）、空なら保存しない", () => {
  const setting = chatAttachmentsDraft(1);
  const ok = { kind: "file" as const, id: "a", name: "x.png", mime: "image/png", size: 3 };
  const legacy = { id: "b", name: "m.md", mime: "text/markdown", size: 0, memo: "m.md" };
  const capture = { kind: "capture", id: "c", name: "i.md", mime: "text/markdown", size: 1, source: { type: "github_issue", label: "#1", url: null }, taken_at: "2026-11-13T00:00:00Z", truncated: false, original_size: 1, redacted: 0 };
  const broken = { kind: "capture", id: "d", name: "i.md", mime: "text/markdown", size: 1 };
  assert.deepEqual(setting.decode(JSON.stringify([ok, { id: 1 }, null, legacy, capture, broken])), [ok, { ...legacy, kind: "memo" }, capture]);
  assert.equal(setting.decode("{}"), undefined);
  assert.equal(setting.encode([]), null);
  assert.equal(setting.encode([ok]), JSON.stringify([ok]));
});

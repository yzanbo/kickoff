import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "vitest";
import { fileURLToPath } from "node:url";
import { DATABASE_ID, chatAttachmentsDraft, chatDraft, FOLDS, NEW_CHAT_DRAFTS, THEME } from "./storageKeys";

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

test("保存するものは storageKeys.ts でだけ宣言する（ほかで宣言すると、起動したときの片付けに渡す群に入らず、キーが消える）", () => {
  const outside = roots.flatMap(sources).filter((file) => {
    if (/storage[\\/](storageKeys|settings|groups)\.ts$/.test(file)) return false;
    return /\bdefineSetting(Family)?\(/.test(fs.readFileSync(file, "utf8"));
  });
  assert.deepEqual(outside.map((f) => path.relative(repo, f)), []);
});

test("localStorage・sessionStorage は storage/settings.ts の外で直接読み書きしない（値がそろわなくなる）", () => {
  const direct = roots.flatMap(sources).filter((file) => {
    if (/storage[\\/](settings|memoryStorage)\.ts$/.test(file)) return false;
    // コメントの中の言葉は数えない
    const code = fs.readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
    return /\b(localStorage|sessionStorage)\b/.test(code);
  });
  assert.deepEqual(direct.map((f) => path.relative(repo, f)), []);
});

test("宣言: ID を含むもの（チャット・グループ・下書き）には印があり、含まないもの（テーマ・DB の ID）にはない", () => {
  assert.equal(chatDraft(1).ids, true);
  assert.equal(chatAttachmentsDraft(1).ids, true);
  assert.equal(FOLDS.ids, true);
  assert.equal(NEW_CHAT_DRAFTS.ids, true);
  assert.equal(THEME.ids, false);
  assert.equal(DATABASE_ID.ids, false);
});

test("送る前の添付: 形の合う添付だけを読み、空なら保存しない", () => {
  const setting = chatAttachmentsDraft(1);
  const ok = { kind: "file" as const, id: "a", name: "x.png", mime: "image/png", size: 3 };
  const note = { kind: "note", id: "b", name: "m.md", mime: "text/markdown", size: 4, note: "m.md", taken_at: "2026-11-13T00:00:00Z" };
  const capture = { kind: "capture", id: "c", name: "i.md", mime: "text/markdown", size: 1, source: { type: "github_issue", label: "#1", url: null }, taken_at: "2026-11-13T00:00:00Z", truncated: false, original_size: 1, redacted: 0 };
  const broken = { kind: "capture", id: "d", name: "i.md", mime: "text/markdown", size: 1 };
  const noKind = { id: "e", name: "n.md", mime: "text/markdown", size: 0, note: "n.md" };
  assert.deepEqual(setting.decode(JSON.stringify([ok, { id: 1 }, null, note, capture, broken, noKind])), [ok, note, capture]);
  assert.equal(setting.decode("{}"), undefined);
  assert.equal(setting.encode([]), null);
  assert.equal(setting.encode([ok]), JSON.stringify([ok]));
});

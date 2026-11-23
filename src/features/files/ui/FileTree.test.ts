import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { test, vi } from "vitest";
import { buildTree } from "@/foundation/ui/kit/list/treeModel";

// アイコンはテーマの店を読む（サーバーの描画では読めない）ので、空にする
vi.mock("@/foundation/ui/code/FileIcon", () => ({ FileIcon: () => null }));
// 同じプロセスで先に流れたファイルが本物で読み込んでいても、モックで読み直す（あとのファイルにも残さない）
vi.resetModules();
const { FileTree } = await import("./FileTree");

const nodes = buildTree({ files: ["src/a.ts", "src/b.ts", "README.md"], ignored: [{ path: "node_modules", dir: true }] });
const kinds = { files: new Map([["src/a.ts", "M" as const]]), folders: new Map([["src", "M" as const]]) };

test("FileTree: 開いたフォルダの中と変更の記号を描き、無視しているフォルダは開けない行にする", () => {
  const html = renderToString(createElement(FileTree, { nodes, open: new Set(["src"]), onToggle: () => {}, onSelect: () => {}, kinds, selected: "src/b.ts" }));
  assert.deepEqual([...html.matchAll(/class="tree-name">([^<]+)/g)].map((m) => m[1]), ["node_modules", "src", "a.ts", "b.ts", "README.md"]);
  assert.match(html, /aria-selected="false" data-kind="M" title="src\/a\.ts（変更）"/);
  assert.match(html, /aria-selected="true" title="src\/b\.ts" class="list-item tree-row tree-indent selected"/);
  // 無視しているフォルダは開閉の印（aria-expanded）を持たず、薄く出す
  assert.match(html, /aria-level="1" aria-selected="false" title="node_modules" class="list-item tree-row tree-indent ignored"/);
});

test("FileTree: 新しいファイルの名前の欄は、作るフォルダの中のいちばん上に出す", () => {
  const create = { creating: { parent: "src", dir: false }, start: () => {}, submit: () => {}, cancel: () => {} };
  const html = renderToString(createElement(FileTree, { nodes, open: new Set(["src"]), onToggle: () => {}, onSelect: () => {}, kinds, create }));
  assert.match(html, /tree-name">src<.*placeholder="ファイル名".*tree-name">a\.ts</);
});

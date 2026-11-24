import assert from "node:assert/strict";
import { test } from "vitest";
import { buildTree } from "@/foundation/ui/kit/list/treeModel";
import { CREATE_KEY, fileRowLook, fileRows, type FileRow } from "./fileTreeModel";

const nodes = buildTree({ files: ["src/a.ts", "src/b.ts", "README.md"], ignored: [{ path: "node_modules", dir: true }] });
const marks = { files: new Map([["src/a.ts", { kind: "M", label: "変更" }]]), folders: new Map([["src", { kind: "M", label: "変更" }]]) };

/** 開いたフォルダの中まで、描く順に行のキーを並べる */
const shown = (rows: FileRow[], open: ReadonlySet<string>): string[] => rows.flatMap((r) => [r.key, ...(r.children && open.has(r.key) ? shown(r.children, open) : [])]);

test("開いたフォルダの中と変更の記号を描き、無視しているフォルダは開けない行にする", () => {
  const { roots, nodeOf } = fileRows(nodes, undefined);
  assert.deepEqual(shown(roots, new Set(["src"])), ["node_modules", "src", "src/a.ts", "src/b.ts", "README.md"]);
  // 無視しているフォルダは中を持たず（開閉の印を持たない）、薄く出す
  assert.equal(roots[0].children, undefined);
  const ignored = nodeOf("node_modules");
  assert.ok(ignored);
  assert.deepEqual(fileRowLook(ignored, undefined), { className: "ignored", "data-kind": undefined, title: "node_modules" });
  const changed = nodeOf("src/a.ts");
  assert.ok(changed);
  assert.deepEqual(fileRowLook(changed, marks.files.get("src/a.ts")), { className: undefined, "data-kind": "M", title: "src/a.ts（変更）" });
});

test("新しいファイルの名前の欄は、作るフォルダの中のいちばん上に出す", () => {
  const { roots } = fileRows(nodes, { parent: "src", dir: false });
  assert.deepEqual(shown(roots, new Set(["src"])), ["node_modules", "src", CREATE_KEY, "src/a.ts", "src/b.ts", "README.md"]);
});

import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { test } from "vitest";
import { DocumentConflictBar } from "./DocumentConflictBar";
import { useDocument } from "./useDocument";

/** 最初の描画（effect は流れない）: 読み込むまでは loading で、中身・指紋・書き始めの中身を持たない */
test("useDocument: 読み込むまでは loading で中身を持たない", () => {
  const Probe = () => {
    const doc = useDocument({
      key: "1:a.md",
      source: { read: async () => ({ content: "本文", hash: "h1" }), write: async () => ({ hash: "h2" }) },
      title: "a.md",
      surface: "notes",
    });
    return `${doc.status}:${doc.base === null}:${doc.initial === null}:${doc.changedOnDisk}`;
  };
  assert.equal(renderToString(createElement(Probe)), "loading:true:true:false");
});

test("DocumentConflictBar: 説明と、読み直す・上書きのボタンを出す", () => {
  const html = renderToString(createElement(DocumentConflictBar, { onReload: () => {}, onOverwrite: () => {} }, "ほかで変わりました。"));
  assert.match(html, /role="status"/);
  assert.match(html, /ほかで変わりました。/);
  assert.equal(html.match(/<button/g)?.length, 2);
});

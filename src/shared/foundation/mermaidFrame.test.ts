import assert from "node:assert/strict";
import vm from "node:vm";
import { test } from "vitest";
import { MERMAID_FRAME_HTML, MERMAID_FRAME_MESSAGES as M, MERMAID_FRAME_SCRIPT, mermaidFrameCsp, mermaidFrameReply } from "./mermaidFrame";

test("mermaidFrameCsp: スクリプトは中のスクリプトのハッシュと Blob だけ、画像・フォントは data: だけで、外へは読み込み・通信ができない", () => {
  const csp = mermaidFrameCsp("abc=");
  const directives = new Map(csp.split("; ").map((d) => [d.slice(0, d.indexOf(" ")), d.slice(d.indexOf(" ") + 1)]));
  assert.equal(directives.get("default-src"), "'none'");
  assert.equal(directives.get("script-src"), "'sha256-abc=' blob:");
  assert.equal(directives.get("style-src"), "'unsafe-inline'");
  assert.equal(directives.get("img-src"), "data:");
  assert.equal(directives.get("font-src"), "data:");
  assert.equal(directives.get("connect-src"), "'none'");
  assert.equal(directives.get("frame-src"), "'none'");
  assert.equal(directives.get("form-action"), "'none'");
  assert.equal(directives.get("base-uri"), "'none'");
  // URL・'self'・何でも許す書き方を含まない
  assert.doesNotMatch(csp, /https?:|'self'|\*|'unsafe-eval'/);
});

test("MERMAID_FRAME_HTML: 書いたままのスクリプトは MERMAID_FRAME_SCRIPT の 1 つだけで、外を読む要素を持たない", () => {
  assert.equal(MERMAID_FRAME_HTML.split("<script").length - 1, 1);
  assert.ok(MERMAID_FRAME_HTML.includes(`<script>${MERMAID_FRAME_SCRIPT}</script>`));
  assert.doesNotMatch(MERMAID_FRAME_HTML, /\bsrc=|\bhref=|<link|<img|<iframe/i);
});

test("mermaidFrameReply: 決まった形だけを読み、ほかの形・型の違う値・正でない id は捨てる（理由の文は長さを切る）", () => {
  assert.deepEqual(mermaidFrameReply({ type: M.ready }), { type: "ready" });
  assert.deepEqual(mermaidFrameReply({ type: M.loaded }), { type: "loaded" });
  assert.deepEqual(mermaidFrameReply({ type: M.rendered, id: 3, svg: "<svg/>" }), { type: "rendered", id: 3, svg: "<svg/>" });
  assert.deepEqual(mermaidFrameReply({ type: M.failed, id: null, message: "x" }), { type: "failed", id: null, message: "x" });
  assert.equal(mermaidFrameReply({ type: M.failed, id: 1, message: "あ".repeat(5_000) })?.type, "failed");
  const long = mermaidFrameReply({ type: M.failed, id: 1, message: "あ".repeat(5_000) });
  assert.equal(long?.type === "failed" ? long.message.length : -1, 1_000);
  for (const bad of [
    null,
    "kickoff-mermaid-ready",
    { type: "kickoff-visual-ready" },
    { type: M.rendered, id: "3", svg: "<svg/>" },
    { type: M.rendered, id: 0, svg: "<svg/>" },
    { type: M.rendered, id: 1.5, svg: "<svg/>" },
    { type: M.rendered, id: 1, svg: { toString: () => "<svg/>" } },
    { type: M.failed, id: undefined, message: "x" },
    { type: M.failed, id: 1 },
    // 外から中への頼みの形は、中からの知らせとして受けない
    { type: M.render, id: 1, code: "x", config: {} },
    { type: M.load, script: "x" },
  ]) {
    assert.equal(mermaidFrameReply(bad), null, JSON.stringify(bad));
  }
});

/** 枠の中のスクリプトを、偽の窓・文書の上で動かす（parent から送った体の postMessage と、中から parent へ送った知らせを受ける） */
function runFrameScript(mermaid: { initialize: (c: unknown) => void; render: (id: string, code: string) => Promise<{ svg: string }> }) {
  const posts: unknown[] = [];
  const waiters: (() => void)[] = [];
  // 枠の中（別の realm）で作った値は、比べられるよう JSON で写して受ける
  const parent = { postMessage: (data: unknown) => (posts.push(JSON.parse(JSON.stringify(data))), waiters.shift()?.()) };
  let listener: ((e: { source: unknown; data: unknown }) => void) | undefined;
  const scripts: { src: string; onload?: () => void }[] = [];
  const blobs: unknown[] = [];
  let cleared = 0;
  const context: Record<string, unknown> = {
    parent,
    addEventListener: (type: string, fn: typeof listener) => type === "message" && (listener = fn),
    Blob: class {
      constructor(parts: unknown[]) {
        blobs.push(JSON.parse(JSON.stringify(parts)));
      }
    },
    URL: { createObjectURL: () => "blob:null/1", revokeObjectURL: () => undefined },
    document: {
      createElement: () => ({ src: "" }),
      head: { append: (s: { src: string; onload?: () => void }) => scripts.push(s) },
      body: { replaceChildren: () => cleared++ },
    },
  };
  context.window = context;
  vm.runInNewContext(MERMAID_FRAME_SCRIPT, context);
  const nextPost = () => new Promise<void>((resolve) => waiters.push(resolve));
  const send = (data: unknown, source: unknown = parent) => listener?.({ source, data });
  const loadMermaid = () => (context.mermaid = mermaid);
  return { posts, scripts, blobs, send, nextPost, loadMermaid, cleared: () => cleared };
}

test("枠の中のスクリプト: parent からの決まった形の頼みだけを受け、Mermaid を Blob で 1 回だけ読み、頼みの id ごとに描いた SVG・失敗を返す", async () => {
  const calls: unknown[] = [];
  const frame = runFrameScript({
    initialize: (config) => calls.push(["initialize", config]),
    render: async (id, code) => {
      calls.push(["render", id, code]);
      if (code === "bad") throw new Error("書き方の誤り");
      return { svg: `<svg id="${id}"></svg>` };
    },
  });
  assert.deepEqual(frame.posts, [{ type: M.ready }]);

  // parent でない窓・形の違う頼みは受けない
  frame.send({ type: M.load, script: "x" }, {});
  frame.send({ type: M.load, script: 1 });
  frame.send({ type: M.render, id: 1, code: "x", config: {} }, {});
  frame.send({ type: M.render, id: -1, code: "x", config: {} });
  frame.send({ type: M.render, id: 1, code: "x", config: null });
  assert.equal(frame.scripts.length, 0);
  assert.deepEqual(calls, []);

  // 読み込みは 1 回だけ（読み込み中の 2 回目は捨てる）
  frame.send({ type: M.load, script: "window.mermaid = {}" });
  frame.send({ type: M.load, script: "2 回目" });
  assert.equal(frame.scripts.length, 1);
  assert.equal(frame.scripts[0].src, "blob:null/1");
  assert.deepEqual(frame.blobs, [["window.mermaid = {}"]]);
  frame.loadMermaid();
  frame.scripts[0].onload?.();
  assert.deepEqual(frame.posts.at(-1), { type: M.loaded });

  const rendered = frame.nextPost();
  frame.send({ type: M.render, id: 7, code: "flowchart TD\nA-->B", config: { theme: "base" } });
  await rendered;
  assert.deepEqual(frame.posts.at(-1), { type: M.rendered, id: 7, svg: '<svg id="mermaid-7"></svg>' });
  assert.deepEqual(calls, [["initialize", { theme: "base" }], ["render", "mermaid-7", "flowchart TD\nA-->B"]]);

  const failed = frame.nextPost();
  frame.send({ type: M.render, id: 8, code: "bad", config: {} });
  await failed;
  assert.deepEqual(frame.posts.at(-1), { type: M.failed, id: 8, message: "書き方の誤り" });
  // 描き終えるたびに本文を空に戻す（前の図の下書きの要素を、次の図に見せない）
  assert.ok(frame.cleared() >= 1);
});

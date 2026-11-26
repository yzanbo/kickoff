import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "vitest";
import { MERMAID_VERSION, mermaidReadsOutside } from "./mermaidResources";

test("mermaidReadsOutside: 描く途中で外を読む書き方（画像の形・参加者の icon・CSS の url と @import）は当たる", () => {
  for (const code of [
    'flowchart TD\n  A@{ img: "https://evil.example/a.png", label: "x" }',
    "flowchart TD\n  A@{ img: //evil.example/a.png }",
    'flowchart TD\n  A@{ "img": "/api/projects" }',
    'flowchart TD\n  A@{\n    shape: image\n    img: "http://127.0.0.1:1/x"\n  }',
    'sequenceDiagram\n  participant A\n  properties A: {"class": "c", "icon": "https://evil.example/i.png"}',
    "flowchart TD\n  A-->B\n  style A fill:url(https://evil.example/p)",
    'flowchart TD\n  A-->B\n  style A fill:url("//evil.example/p")',
    "flowchart TD\n  classDef x background-image: url( 'https://evil.example/p' )\n  A:::x",
    '%%{init: {"themeCSS": "@import \'https://evil.example/a.css\';"}}%%\nflowchart TD\n  A-->B',
  ]) {
    assert.equal(mermaidReadsOutside(code), true, code);
  }
});

test("mermaidReadsOutside: ふつうの図（形・アイコンの名前・# の url・data: の画像・リンク）は当たらない", () => {
  for (const code of [
    "flowchart TD\n  A[開始] --> B{判定}\n  B -->|はい| C[img: という文字]",
    'flowchart TD\n  A@{ shape: rounded, label: "img のない形" }\n  B@{ icon: "fa:user", form: "square" }',
    'flowchart TD\n  A@{ img: "data:image/png;base64,AAAA" }',
    'sequenceDiagram\n  participant A\n  properties A: {"class": "c", "icon": "@clock"}\n  A->>A: icon: https://example.com',
    "flowchart TD\n  A-->B\n  style A fill:#f9f,stroke:#333\n  linkStyle 0 marker-end:url(#arrow)",
    'flowchart TD\n  A-->B\n  style A fill:url("#grad")',
    'flowchart TD\n  A-->B\n  click A "https://example.com" "説明"',
    "C4Context\n  Person(a, \"利用者\", $sprite=\"person\")",
    "architecture-beta\n  service db(database)[DB]",
    "mindmap\n  root((中心))\n    子::icon(fa fa-book)",
    // HTML のタグの名前のラベル（htmlLabels は書き換えられないので文字になる。枠の中では読みに行けない）
    "flowchart TD\n  A[\"<img src='https://evil.example/a.png'>\"] --> B[\"<video> 要素\"]",
  ]) {
    assert.equal(mermaidReadsOutside(code), false, code);
  }
});

test("mermaidReadsOutside: CSS のエスケープ・コメントで隠した url・@import と @font-face は当たる", () => {
  for (const code of [
    "flowchart TD\n  A-->B\n  style A fill:\\75rl(https://evil.example/p)",
    "flowchart TD\n  A-->B\n  style A fill:u\\rl(https://evil.example/p)",
    "flowchart TD\n  A-->B\n  style A fill:u/**/rl(https://evil.example/p)",
    '%%{init:{"themeCSS":"@font-face{font-family:x;src:local(x)}"}}%%\nflowchart TD\n  A-->B',
    "flowchart TD\r  A-->B\r  style A fill:url(https://evil.example/p)",
  ]) {
    assert.equal(mermaidReadsOutside(code), true, JSON.stringify(code));
  }
});

test("mermaidReadsOutside: 前書き・%%{init}%%・CSS の文の \\ は、それだけでは断らず描く枠に任せる（ラベルの \\ のある前書き付きの図を描けるように）", () => {
  // 配色・CSS の設定は MERMAID_SECURE_KEYS で消え、枠の中は外を読めず、戻った SVG の CSS は sanitizeSvg がエスケープを戻してから外す
  for (const code of [
    "---\ntitle: 図\n---\nflowchart TD\n  A[\"C:\\\\Users\\\\a\"] --> B",
    '%%{init: {"flowchart": {"curve": "linear"}}}%%\nflowchart TD\n  A["a\\\\b"] --> B',
    'flowchart TD\n  A["a\\\\b"] --> B\n  style B fill:#f9f',
    "flowchart TD\n  A-->B\n  classDef x fill:#f00\\9",
  ]) {
    assert.equal(mermaidReadsOutside(code), false, JSON.stringify(code));
  }
});

test("MERMAID_VERSION: パソコンが読む mermaid の版と同じ（スマホは CDN からこの版を読む）", () => {
  const pkg = JSON.parse(readFileSync(new URL("../../../node_modules/mermaid/package.json", import.meta.url), "utf8")) as { version: string };
  assert.equal(pkg.version, MERMAID_VERSION);
});

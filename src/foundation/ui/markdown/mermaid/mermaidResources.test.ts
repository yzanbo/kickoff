import assert from "node:assert/strict";
import { test } from "vitest";
import { mermaidReadsOutside } from "./mermaidResources";

test("mermaidReadsOutside: 描く途中で外を読む書き方（画像の形・参加者の icon・CSS の url と @import・HTML の画像）は当たる", () => {
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
    "flowchart TD\n  A[\"<img src='https://evil.example/a.png'>\"]",
    "flowchart TD\n  A[\"< IMAGE href=x>\"]",
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
  ]) {
    assert.equal(mermaidReadsOutside(code), false, code);
  }
});

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

test("mermaidReadsOutside: CSS のエスケープ・コメントで隠した url・@import・image-set・@font-face と、CSS を書ける所の \\ は当たる", () => {
  for (const code of [
    '%%{init:{"themeCSS":".node{background-image:\\\\75 rl(https://evil.example/a.png)}"}}%%\nflowchart TD\n  A-->B',
    "flowchart TD\n  A-->B\n  style A fill:\\75rl(https://evil.example/p)",
    "flowchart TD\n  A-->B\n  style A fill:u\\rl(https://evil.example/p)",
    '%%{init:{"themeCSS":"\\\\40 import \\"https://evil.example/a.css\\";"}}%%\nflowchart TD\n  A-->B',
    '%%{init:{"themeCSS":".a{background:-webkit-\\\\69 mage-set(\\"https://evil.example/a.png\\" 1x)}"}}%%\nflowchart TD\n  A-->B',
    '%%{init:{"themeCSS":"@font-face{font-family:x;src:local(x)}"}}%%\nflowchart TD\n  A-->B',
    "---\nconfig:\n  themeCSS: \".a{fill:\\\\u0075rl(x)}\"\n---\nflowchart TD\n  A-->B",
    "flowchart TD\n  A-->B\n  classDef x fill:#f00\\9",
  ]) {
    assert.equal(mermaidReadsOutside(code), true, code);
  }
  // ラベルの中の \ （CSS を書けない所）は描く
  assert.equal(mermaidReadsOutside('flowchart TD\n  A["C:\\\\Users\\\\a"] --> B'), false);
});

test("mermaidReadsOutside: 前書きの字下げ・--- の後ろの空白・CRLF・タブの字下げ・閉じのない %%{ と、; で続けた style の \\ でもすり抜けない", () => {
  const css = 'themeCSS: ".node{background:\\x75rl(https://evil.example/m5)}"';
  for (const code of [
    `  ---\n  config:\n    ${css}\n  ---\nflowchart TD\nA-->B`,
    `--- \nconfig:\n  ${css}\n---\nflowchart TD\nA-->B`,
    `---\r\nconfig:\r\n  ${css}\r\n---\r\nflowchart TD\r\nA-->B`,
    `\t---\n\tconfig:\n\t  ${css}\n\t---\nflowchart TD\nA-->B`,
    '\n---\nconfig:\n  gantt:\n    todayMarker: "stroke:\\x75rl(https://evil.example/p)"\n---\ngantt\n  title x',
    'flowchart TD\n  A-->B\n%%{init: {"themeCSS": ".a{fill:\\u0075rl(https://evil.example/p)}"}',
    "flowchart TD; A-->B; style A fill:\\9",
    "flowchart TD\r  A-->B\r  style A fill:#f00\\9",
  ]) {
    assert.equal(mermaidReadsOutside(code), true, JSON.stringify(code));
  }
  // 前書き・%%{…}%%・CSS を書ける文のない図のラベルの \ と、\ のない前書きは描く
  assert.equal(mermaidReadsOutside("---\ntitle: 図\nconfig:\n  flowchart:\n    curve: linear\n---\nflowchart TD\n  A-->B"), false);
  assert.equal(mermaidReadsOutside('flowchart TD\n  A["a\\\\b"] --> B\n  style B fill:#f9f'), false);
});

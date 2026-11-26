import assert from "node:assert/strict";
import { onTestFinished, test } from "vitest";
import { MERMAID_SAFE_CONFIG, MERMAID_SECURE_KEYS } from "@shared/foundation/mermaidResources";

test("MERMAID_SECURE_KEYS: 前書き（字下げ・CRLF・タブ）と %%{init}%%（閉じのないものも）の config から、配色・CSS・字体を変えられない", async () => {
  const { default: mermaid } = await import("mermaid");
  // Mermaid の設定はモジュールに 1 つなので、終わったら素の設定に戻す
  onTestFinished(() => mermaid.initialize({}));
  mermaid.initialize({ startOnLoad: false, theme: "base", fontFamily: "APP", themeVariables: { primaryColor: "#123456" }, secure: [...MERMAID_SECURE_KEYS] });
  const config = ' themeCSS: ".node{background:\\x75rl(https://evil.example/m5)}"\n theme: dark\n fontFamily: EVIL\n altFontFamily: EVIL\n themeVariables:\n  primaryColor: "#ff0000"\n flowchart:\n  themeCSS: x\n  htmlLabels: true';
  const yaml = (indent: string, eol: string) =>
    [`${indent}--- `, `${indent}config:`, ...config.split("\n").map((line) => `${indent} ${line}`), `${indent}---`, "flowchart TD", "A-->B"].join(eol);
  const json = '{"themeCSS": ".a{}", "theme": "forest", "fontFamily": "EVIL", "themeVariables": {"primaryColor": "#ff0000"}, "config": {"themeCSS": "x"}}';
  for (const code of [yaml("  ", "\n"), yaml("", "\r\n"), yaml("\t", "\n"), `%%{init: ${json}}%%\nflowchart TD\nA-->B`, `flowchart TD\nA-->B\n%%{init: ${json}`]) {
    await mermaid.parse(code);
    const c = mermaid.mermaidAPI.getConfig();
    const flowchart: Record<string, unknown> = { ...c.flowchart };
    assert.deepEqual(
      [c.themeCSS, c.theme, c.fontFamily, c.altFontFamily, c.themeVariables?.primaryColor, c.themeVariables?.fontFamily, flowchart.themeCSS, flowchart.htmlLabels],
      [undefined, "base", "APP", undefined, "#123456", "APP", undefined, undefined],
      JSON.stringify(code),
    );
  }
});

test("MERMAID_SAFE_CONFIG: flowchart の形が直に読む flowchart.htmlLabels も false にし、図の中の設定で HTML のラベルに戻せない", async () => {
  const { default: mermaid } = await import("mermaid");
  onTestFinished(() => mermaid.initialize({}));
  // 上の階層の htmlLabels だけだと flowchart.htmlLabels は書かれず、swimlane の枠などは「書いていない」を HTML のラベルと読む
  mermaid.initialize({ htmlLabels: false });
  assert.equal(mermaid.mermaidAPI.getConfig().flowchart?.htmlLabels, undefined);
  mermaid.initialize({ ...MERMAID_SAFE_CONFIG, flowchart: { ...MERMAID_SAFE_CONFIG.flowchart }, secure: [...MERMAID_SAFE_CONFIG.secure] });
  for (const code of ["flowchart TD\nA-->B", '%%{init: {"htmlLabels": true, "flowchart": {"htmlLabels": true}}}%%\nflowchart TD\nA-->B']) {
    await mermaid.parse(code);
    const c = mermaid.mermaidAPI.getConfig();
    assert.deepEqual([c.htmlLabels, c.flowchart?.htmlLabels], [false, false], code);
  }
});

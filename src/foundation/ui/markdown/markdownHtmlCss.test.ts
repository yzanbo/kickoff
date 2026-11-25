import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "vitest";

/*
 * Markdown の中の HTML の CSS（MarkdownHtml.css）を読んで、詳細度と文字の大きさを確かめる（ブラウザを使わない計算。
 * 大きさを変えるタグをどう重ねても、10px より小さくならず、見出し（h1 の 19px）より大きくならないこと）
 */
const htmlCss = readFileSync(new URL("./MarkdownHtml.css", import.meta.url), "utf8");
const markdownCss = readFileSync(new URL("./Markdown.css", import.meta.url), "utf8");

/** CSS の規則（コメントを除き、いちばん内側の { … } ごと） */
function rulesOf(css: string): { selector: string; body: string }[] {
  const plain = css.replace(/\/\*[\s\S]*?\*\//g, "");
  return [...plain.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ selector: m[1].trim().replace(/\s+/g, " "), body: m[2] }));
}

test("ほかの CSS を戻す規則は詳細度 0（:where）で、見た目の規則より前にある", () => {
  const rules = rulesOf(htmlCss);
  const revert = rules.findIndex((r) => /all:\s*revert/.test(r.body));
  assert.ok(revert >= 0);
  assert.ok(rules[revert].selector.startsWith(":where(") && rules[revert].selector.endsWith(")"), rules[revert].selector);
  assert.ok(rules.slice(0, revert).every((r) => !/font-size|text-align/.test(r.body)));
  // 見た目の規則は戻す規則より後ろ（同じ層で後ろ・詳細度が上）
  assert.ok(rules.slice(revert + 1).some((r) => /font-size/.test(r.body)));
});

/** タグごとの文字の大きさ（親の大きさ px → 自分の大きさ px）。書き方は max(Nem, Mpx) と min(Nem, calc(Mpx * var(--chat-scale, 1))) だけを読む */
function sizeRules(): Map<string, (parent: number) => number> {
  const rules = new Map<string, (parent: number) => number>();
  const add = (tags: string[], value: string) => {
    const floor = /^max\(([\d.]+)em, (\d+)px\)$/.exec(value);
    const ceil = /^min\(([\d.]+)em, calc\((\d+)px \* var\(--chat-scale, 1\)\)\)$/.exec(value);
    assert.ok(floor || ceil, `読めない大きさの書き方: ${value}`);
    const fn = floor ? (p: number) => Math.max(Number(floor[1]) * p, Number(floor[2])) : (p: number) => Math.min(Number(ceil?.[1]) * p, Number(ceil?.[2]));
    for (const tag of tags) rules.set(tag, fn);
  };
  for (const { selector, body } of rulesOf(htmlCss)) {
    const size = /font-size:\s*([^;]+);/.exec(body)?.[1].trim();
    const tags = /^\.markdown \.md-html:is\(([^)]+)\)$/.exec(selector)?.[1].split(",").map((t) => t.trim());
    if (size && tags) add(tags, size);
  }
  // Markdown も作るタグ（コード・脚注の番号）は Markdown.css の規則（HTML の同じタグも戻さずに同じ規則）
  for (const tag of ["code", "sup"]) {
    const rule = rulesOf(markdownCss).find((r) => r.selector === `.markdown ${tag}`);
    add([tag], /font-size:\s*([^;]+);/.exec(rule?.body ?? "")?.[1].trim() ?? "");
  }
  return rules;
}

test("大きさを変えるタグをどう重ねても、10px 以上・見出しの 19px 以下", () => {
  const rules = sizeRules();
  const tags = ["small", "sub", "sup", "rt", "big", "tt", "kbd", "samp", "code"];
  for (const tag of tags) assert.ok(rules.has(tag), `${tag} の大きさの規則がない`);
  // 重ねる順をすべて試す（同じタグの重なりは読み取りが外すので、続けて同じタグは置かない）。土台は会話の文字・見出しの大きさ
  const visit = (size: number, last: string, depth: number, path: string) => {
    assert.ok(size >= 10 - 1e-9 && size <= 19 + 1e-9, `${path}: ${size}px`);
    if (depth === 0) return;
    for (const tag of tags) if (tag !== last) visit(rules.get(tag)?.(size) ?? size, tag, depth - 1, `${path}>${tag}`);
  };
  for (const base of [10, 12, 13, 14, 16, 19]) visit(base, "", 4, `${base}px`);
});

test("Markdown が作る、大きさを em で変える要素（脚注の番号の sup・コード）も 10px の下限があり、HTML の同じタグは戻さない", () => {
  for (const { selector, body } of rulesOf(markdownCss)) {
    const size = /font-size:\s*([^;]+);/.exec(body)?.[1].trim();
    // 小さくする em（1em 未満）は 10px の下限付き。数式（.katex）は大きくするだけ
    const em = size && /^([\d.]+)em$/.exec(size);
    assert.ok(!em || Number(em[1]) >= 1, `${selector}: ${size}`);
  }
  const revert = rulesOf(htmlCss).find((r) => /all:\s*revert/.test(r.body));
  assert.match(revert?.selector ?? "", /:not\([^)]*\bsup\b[^)]*\)/);
  assert.ok(!rulesOf(htmlCss).some((r) => /\bsup\b/.test(r.selector) && /font-size/.test(r.body)));
});

test("数式（.katex）は、大きさを変えるタグをどう重ねた中でも会話の本文（14px）より小さくならない（入れ子の添え字は KaTeX の既定で 0.5 倍まで）", () => {
  const rule = rulesOf(markdownCss).find((r) => r.selector === ".markdown .katex");
  const size = /font-size:\s*([^;]+);/.exec(rule?.body ?? "")?.[1].trim();
  const m = /^max\(([\d.]+)em, var\(--chat-fs-(\d+)\)\)$/.exec(size ?? "");
  assert.ok(m, `読めない大きさの書き方: ${size}`);
  const katexSize = (parent: number) => Math.max(Number(m[1]) * parent, Number(m[2]));
  const rules = sizeRules();
  const tags = [...rules.keys()];
  let smallest = Infinity;
  const visit = (parentSize: number, last: string, depth: number) => {
    smallest = Math.min(smallest, katexSize(parentSize));
    if (depth === 0) return;
    for (const tag of tags) if (tag !== last) visit(rules.get(tag)?.(parentSize) ?? parentSize, tag, depth - 1);
  };
  for (const base of [10, 12, 13, 14, 16, 19]) visit(base, "", 4);
  assert.equal(smallest, 14);
  // 入れ子の添え字（x_{y_{z}}）は KaTeX が数式の大きさの 0.5 倍まで縮める（いちばん小さい数式で 7px）
  assert.equal(smallest * 0.5, 7);
});

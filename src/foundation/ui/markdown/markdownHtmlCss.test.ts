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
  const code = rulesOf(markdownCss).find((r) => r.selector === ".markdown code");
  add(["code"], /font-size:\s*([^;]+);/.exec(code?.body ?? "")?.[1].trim() ?? "");
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

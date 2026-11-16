import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { test } from "vitest";
import { THEME_BACKGROUNDS } from "@shared/theme/backgrounds";

// 起動直後の骨組み（public/boot.js と index.html の <style>。メモの仕様書「0023_表示を軽くする」の案 18a）。
// public/ の中身は Vite がそのまま out/renderer に写すので、テストはここに置く

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");
const bootScript = read("../../public/boot.js");
const indexHtml = read("../../index.html");
const tokensCss = read("../styles/base/tokens.css");
const mobileCss = read("../styles/base/mobile.css");

interface Run {
  stored?: Record<string, string>;
  osDark?: boolean;
  hash?: string;
  broken?: boolean;
}

/** boot.js を偽の localStorage・matchMedia・document で動かし、<html> に付いた属性と変数を返す（グローバルは変えない） */
function runBoot({ stored = {}, osDark = false, hash = "", broken = false }: Run) {
  const attrs: Record<string, string> = {};
  const vars: Record<string, string> = {};
  const context = {
    localStorage: {
      getItem: (key: string) => {
        if (broken) throw new Error("読めない");
        return stored[key] ?? null;
      },
    },
    matchMedia: (query: string) => ({ matches: query === "(prefers-color-scheme: dark)" && osDark }),
    location: { hash },
    document: { documentElement: { setAttribute: (k: string, v: string) => (attrs[k] = v), style: { setProperty: (k: string, v: string) => (vars[k] = v) } } },
  };
  vm.runInNewContext(bootScript, context);
  return { theme: attrs["data-theme"], shell: attrs["data-boot-shell"], width: vars["--boot-sidebar-w"] };
}

test("テーマ: light・dark・system（OS に合わせる）・未保存と知らない値はダーク（app/theme.ts と同じ）", () => {
  assert.equal(runBoot({ stored: { "kickoff:theme": "light" } }).theme, "light");
  assert.equal(runBoot({ stored: { "kickoff:theme": "dark" }, osDark: false }).theme, "dark");
  assert.equal(runBoot({ stored: { "kickoff:theme": "system" }, osDark: true }).theme, "dark");
  assert.equal(runBoot({ stored: { "kickoff:theme": "system" }, osDark: false }).theme, "light");
  assert.equal(runBoot({}).theme, "dark");
  assert.equal(runBoot({ stored: { "kickoff:theme": "sepia" } }).theme, "dark");
});

test("骨組みの形: サイドバーを開いていれば sidebar、閉じていれば main、別ウィンドウは plain", () => {
  assert.equal(runBoot({}).shell, "sidebar");
  assert.equal(runBoot({ stored: { "kickoff:sidebar": "open" } }).shell, "sidebar");
  assert.equal(runBoot({ stored: { "kickoff:sidebar": "closed" } }).shell, "main");
  assert.equal(runBoot({ hash: "#/popout/chat?id=3" }).shell, "plain");
  assert.equal(runBoot({ hash: "#/projects/1" }).shell, "sidebar");
});

test("サイドバーの幅: 未保存・壊れた値は 294、範囲の外は 200〜480 に丸める（useSidebar.ts と同じ）", () => {
  assert.equal(runBoot({}).width, "294px");
  assert.equal(runBoot({ stored: { "kickoff:sidebar-width": "abc" } }).width, "294px");
  assert.equal(runBoot({ stored: { "kickoff:sidebar-width": "320" } }).width, "320px");
  assert.equal(runBoot({ stored: { "kickoff:sidebar-width": "120" } }).width, "200px");
  assert.equal(runBoot({ stored: { "kickoff:sidebar-width": "900" } }).width, "480px");
  assert.equal(runBoot({ stored: { "kickoff:sidebar-width": "300.6" } }).width, "301px");
});

test("localStorage が読めなくても投げない（既定の骨組みのまま）", () => {
  assert.deepEqual(runBoot({ broken: true }), { theme: undefined, shell: undefined, width: undefined });
});

/** CSS の文字から、そのセレクタの塊の中の変数の値を読む */
function cssVar(css: string, selector: string, name: string): string | undefined {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) return undefined;
  const block = css.slice(start, css.indexOf("}", start));
  return block.match(new RegExp(`${name}:\\s*(#[0-9a-fA-F]+)`))?.[1]?.toLowerCase();
}

test("骨組みの色は tokens.css の --bg・--bg-sidebar・--border と同じ（ダーク・ライト）", () => {
  for (const selector of [":root", ':root[data-theme="light"]']) {
    assert.equal(cssVar(indexHtml, selector, "--boot-bg"), cssVar(tokensCss, selector, "--bg"), `${selector} --bg`);
    assert.equal(cssVar(indexHtml, selector, "--boot-sidebar"), cssVar(tokensCss, selector, "--bg-sidebar"), `${selector} --bg-sidebar`);
    assert.equal(cssVar(indexHtml, selector, "--boot-line"), cssVar(tokensCss, selector, "--border"), `${selector} --border`);
  }
});

test("窓の地の色（THEME_BACKGROUNDS）は tokens.css の --bg と同じ", () => {
  assert.equal(THEME_BACKGROUNDS.dark, cssVar(tokensCss, ":root", "--bg"));
  assert.equal(THEME_BACKGROUNDS.light, cssVar(tokensCss, ':root[data-theme="light"]', "--bg"));
});

test("骨組みの縦 1 列の境目は mobile.css と同じ 720px", () => {
  const width = (css: string) => css.match(/@media \(max-width: (\d+)px\)/)?.[1];
  assert.equal(width(indexHtml), "720");
  assert.equal(width(mobileCss), "720");
});

test("boot.js は CSP の内側（meta の CSP のあと）で、入口のスクリプトより前に読む", () => {
  const csp = indexHtml.indexOf("Content-Security-Policy");
  const boot = indexHtml.indexOf('<script src="/boot.js"></script>');
  assert.ok(csp >= 0 && boot > csp && boot < indexHtml.indexOf('<script type="module"'));
});

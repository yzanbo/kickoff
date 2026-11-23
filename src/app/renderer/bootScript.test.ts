import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { test } from "vitest";
import { THEME_BACKGROUNDS } from "@shared/foundation/theme/backgrounds";
import { storage as shellStorage } from "@/foundation/ui/storage/storage";
import { storage as sidebarStorage } from "@/features/sidebar/ui/storage";

// 起動直後の骨組み（public/boot.js と index.html の <style>）。
// public/ の中身は Vite がそのまま out/renderer に写すので、テストはここに置く

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");
const bootScript = read("./public/boot.js");
const indexHtml = read("./index.html");
const tokensCss = read("../../foundation/ui/styles/tokens.css");
const sidebarCss = read("../../features/sidebar/ui/Sidebar.css");
const footerCss = read("./shell/footer/AppFooter.css");

/** boot.js が文字で読む 4 つのキー（宣言と同じ） */
const THEME = shellStorage.settings.theme.key;
const SIDEBAR = sidebarStorage.settings.open.key;
const WIDTH = sidebarStorage.settings.width.key;
const FOOTER = shellStorage.settings.footerMode.key;

test("boot.js は宣言と同じキーを読む（テーマ・サイドバーの開閉と幅・下の帯の出し方）", () => {
  for (const key of [THEME, SIDEBAR, WIDTH, FOOTER]) assert.ok(bootScript.includes(`localStorage.getItem("${key}")`), key);
});

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
  return { theme: attrs["data-theme"], shell: attrs["data-boot-shell"], width: vars["--boot-sidebar-w"], footer: attrs["data-boot-footer"] };
}

test("テーマ: light・dark・system（OS に合わせる）・未保存と知らない値はダーク（app/theme.ts と同じ）", () => {
  assert.equal(runBoot({ stored: { [THEME]: "light" } }).theme, "light");
  assert.equal(runBoot({ stored: { [THEME]: "dark" }, osDark: false }).theme, "dark");
  assert.equal(runBoot({ stored: { [THEME]: "system" }, osDark: true }).theme, "dark");
  assert.equal(runBoot({ stored: { [THEME]: "system" }, osDark: false }).theme, "light");
  assert.equal(runBoot({}).theme, "dark");
  assert.equal(runBoot({ stored: { [THEME]: "sepia" } }).theme, "dark");
});

test("骨組みの形: サイドバーを開いていれば sidebar、閉じていれば main、別ウィンドウは plain", () => {
  assert.equal(runBoot({}).shell, "sidebar");
  assert.equal(runBoot({ stored: { [SIDEBAR]: "1" } }).shell, "sidebar");
  assert.equal(runBoot({ stored: { [SIDEBAR]: "0" } }).shell, "main");
  assert.equal(runBoot({ hash: "#/popout/chat?id=3" }).shell, "plain");
  assert.equal(runBoot({ hash: "#/projects/1" }).shell, "sidebar");
});

test("サイドバーの幅: 未保存・壊れた値は 294、範囲の外は 200〜480 に丸める（useSidebar.ts と同じ）", () => {
  assert.equal(runBoot({}).width, "294px");
  assert.equal(runBoot({ stored: { [WIDTH]: "abc" } }).width, "294px");
  assert.equal(runBoot({ stored: { [WIDTH]: "320" } }).width, "320px");
  assert.equal(runBoot({ stored: { [WIDTH]: "120" } }).width, "200px");
  assert.equal(runBoot({ stored: { [WIDTH]: "900" } }).width, "480px");
  assert.equal(runBoot({ stored: { [WIDTH]: "300.6" } }).width, "301px");
});

test("localStorage が読めなくても投げない（既定の骨組みのまま）", () => {
  assert.deepEqual(runBoot({ broken: true }), { theme: undefined, shell: undefined, width: undefined, footer: undefined });
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

test("上の帯（信号機ボタンの行）は描かない: 本物の画面ではどの画面でもその場所は地と同じ色で、区切りの線もない", () => {
  // 地と少し違う色の面で描くと、React が描いた瞬間に帯の色だけが消えてちらつく
  assert.ok(!indexHtml.includes("boot-band"));
  // 中身はサイドバーの欄と下の帯だけ
  assert.ok(indexHtml.includes('<div id="root"><div class="boot-shell" aria-hidden="true"><div class="boot-sidebar"></div><div class="boot-footer"></div></div></div>'));
});

test("下の帯の出し方: show・hover・hide をそのまま、未保存と知らない値は show（footerMode.ts の既定と同じ）", () => {
  assert.equal(runBoot({}).footer, "show");
  assert.equal(runBoot({ stored: { [FOOTER]: "hover" } }).footer, "hover");
  assert.equal(runBoot({ stored: { [FOOTER]: "hide" } }).footer, "hide");
  assert.equal(runBoot({ stored: { [FOOTER]: "big" } }).footer, "show");
});

test("骨組みの大きさは本物と同じ: 下の帯は AppFooter.css の 24px で横幅いっぱい、その分サイドバーが短い。幅 720px 以下のサイドバーは Sidebar.css の上限 40dvh", () => {
  assert.match(footerCss, /\.app-footer \{[^}]*grid-column: 1 \/ -1;[^}]*height: 24px/);
  assert.match(indexHtml, /\.boot-footer \{[^}]*left: 0;[^}]*height: 24px/);
  assert.match(indexHtml, /\.boot-sidebar \{ height: calc\(100% - 24px\); \}/);
  const media = indexHtml.slice(indexHtml.indexOf("@media (max-width: 720px)"));
  assert.match(media, /\.boot-sidebar \{[^}]*height: 40dvh/);
  assert.match(sidebarCss, /\.sidebar \{[^}]*max-height: 40dvh/);
});

test("骨組みの縦 1 列の境目は Sidebar.css と同じ 720px", () => {
  const width = (css: string) => css.match(/@media \(max-width: (\d+)px\)/)?.[1];
  assert.equal(width(indexHtml), "720");
  assert.equal(width(sidebarCss), "720");
});

test("boot.js は CSP の内側（meta の CSP のあと）で、入口のスクリプトより前に読む", () => {
  const csp = indexHtml.indexOf("Content-Security-Policy");
  const boot = indexHtml.indexOf('<script src="/boot.js"></script>');
  assert.ok(csp >= 0 && boot > csp && boot < indexHtml.indexOf('<script type="module"'));
});

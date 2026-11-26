// 数式（KaTeX）の設定と、描いた式の整えの決まり（パソコンの返答・ノートと、スマホの WebView のページで同じ）。
// JSON にできる値だけを置き、関数のマクロ（katexLengths.ts）と DOM の整えは使う側で組む

/** KaTeX の版（パソコンは package.json の katex、スマホは CDN から読む版。CSS・フォントも同じ版） */
export const KATEX_VERSION = "0.19.1";

/**
 * 数式で文字・背景の色を変える命令（KaTeX 0.19.1 の \color・\textcolor・\colorbox・\fcolorbox。\red・\blueA などの色の名前の命令も \textcolor を通る）を、
 * 色を変えずに中身だけ描くマクロ。透明度の判定（SEE_THROUGH）だけでは、\color{#141818} のように地と同じ不透明な色の見えない文字・背景を見分けられないため。
 * マクロは命令より先に引き当てられ、\let で写しても \noexpand を付けても元の命令には戻らない（\noexpand の後ろは \relax になる）。
 * 中身のまとまりは保つ（\textcolor の中身は { } で囲み、\colorbox の中身は元と同じく文の書き方、\fcolorbox は色のない枠）。\phantom は色でないので今のまま
 */
const COLOR_MACROS: Readonly<Record<string, string>> = {
  "\\color": "\\@secondoftwo{#1}{}",
  "\\textcolor": "\\@secondoftwo{#1}{{#2}}",
  "\\colorbox": "\\@secondoftwo{#1}{\\text{#2}}",
  "\\fcolorbox": "\\@secondoftwo{#1#2}{\\fbox{#3}}",
};

/**
 * 文字を小さくするサイズの命令（KaTeX 0.19.1 の \tiny・\sixptsize・\scriptsize・\footnotesize・\small。\normalsize より小さいものすべて）を、
 * 大きさを変えずに何もしない形にするマクロ（読めないほど小さい文字を作らせないため。後ろの文字はそのままの大きさで描く）。
 * 色の命令と同じく、マクロが命令より先に引き当てられ、\let・\noexpand でも元の命令には戻らない。添え字の縮みは数式に要るので KaTeX のまま
 */
const SIZE_MACROS: Readonly<Record<string, string>> = { "\\tiny": "", "\\sixptsize": "", "\\scriptsize": "", "\\footnotesize": "", "\\small": "" };

/**
 * 数式の型の命令のうち、文字を 0.5 倍にする \scriptscriptstyle を、添え字の大きさ（0.7 倍）の \scriptstyle にするマクロ
 * （\scriptscriptstyle\text{…} で本文の半分の大きさの長い文を書かせないため）。入れ子の添え字が自動で 0.5 倍になるのは数式に要るので KaTeX のまま
 */
const STYLE_MACROS: Readonly<Record<string, string>> = { "\\scriptscriptstyle": "\\scriptstyle" };

/** 文字のマクロ（色・小さくするサイズ・\scriptscriptstyle。長さのマクロは katexLengths.ts） */
export const KATEX_TEXT_MACROS: Readonly<Record<string, string>> = { ...COLOR_MACROS, ...SIZE_MACROS, ...STYLE_MACROS };

/**
 * KaTeX に渡す設定（JSON にできる値だけ。パソコンとスマホで同じ）。書き方の誤りは赤くせず、文字の色のまま元の式を出す。\href・\includegraphics など外へ出るものは trust: false で止める。
 * maxSize: \rule・\raisebox・\kern などに書いた大きさの上限（em）。KaTeX は正の大きさだけを丸めるので、負の大きさと縦の大きさは
 * katexLengths.ts のマクロで抑える（縦は 1 つ 3em・式ごとの合計 10em、横は ±10em）。式の外へ出た分は CSS で描かない（Markdown.css）。
 * maxExpand: マクロを展開する回数の上限（KaTeX の既定と同じ 1000）。\neq・\dfrac・\cdots なども 1 回と数えるので、
 * 行列・和・極限を並べた式は 40 個並べると 1000 を超える（500 では 20 個で超える）。1000 回でも、長い \def を展開し続ける式は 219ms で止まる（M2 Pro で測った）。
 * macros は KATEX_TEXT_MACROS と長さのマクロ（katexLengths.ts）を、描くたびに新しい写しで渡す（パソコンは katexOptions.ts の getter、スマホは mobile/src/lib/richPages.ts）。
 * KaTeX は \gdef で渡した macros の中身を書き換え、長さのマクロは式ごとに縦の大きさを数えるので、式どうしで定義・数が残らないように
 */
export const KATEX_SETTINGS = {
  throwOnError: false,
  errorColor: "inherit",
  strict: false,
  trust: false,
  maxSize: 10,
  maxExpand: 1000,
} as const;


/** 透明・透明度のある色（KaTeX が色に通すのは色の名前と #rgb・#rgba・#rrggbb・#rrggbbaa だけ） */
const SEE_THROUGH = /^\s*(?:transparent|#[0-9a-f]{4}|#[0-9a-f]{8})\s*$/i;
/** 文字の色の項目（背景・枠の色は文字を隠さないので見ない） */
const COLOR_PROPERTY = /^color$/i;

/** 透明な文字の要素に付けるクラス（Markdown.css・NoteEditor.unlayered.css・スマホのページが選べないようにする） */
export const SEE_THROUGH_CLASS = "katex-see-through";

/** style に、透明・透明度のある色の文字色があるか（\phantom の描き方。色の命令は COLOR_MACROS で色を付けないが、重ねて見る） */
export function isSeeThroughStyle(style: string): boolean {
  return style.split(";").some((decl) => {
    const colon = decl.indexOf(":");
    return colon >= 0 && COLOR_PROPERTY.test(decl.slice(0, colon).trim()) && SEE_THROUGH.test(decl.slice(colon + 1));
  });
}

/** 読み上げ用の MathML のうち、見えない部分（mphantom・透明な mathcolor）か */
export const isHiddenMathml = (tagName: string, mathcolor: unknown): boolean => tagName === "mphantom" || (typeof mathcolor === "string" && SEE_THROUGH.test(mathcolor));

/**
 * 式の箱の縦の大きさの上限（em。式の文字の大きさ）。長さの命令（katexLengths.ts）でない形でも箱は大きくなる
 * （\def\arraystretch{50} の行列・空の行を並べた行列は 120em）ので、描いたあとの箱そのものに上限を付ける。
 * 行の中の式は INLINE_MATH_MAX_EM を超えたら TALL_MATH_CLASS を付けてその高さで切り（8 行の行列 9.6em は切れない）、
 * 段落の式は DISPLAY_MATH_MAX_EM を超えたら式の中でスクロールする（分数を含む 10 行の連立 24.5em・10 行の行列 12em はそのまま）
 */
export const INLINE_MATH_MAX_EM = 10;
export const DISPLAY_MATH_MAX_EM = 40;
export const TALL_MATH_CLASS = "katex-tall";

/** 支柱の style の高さと、基準の線からのずれ（負は深さ） */
const STRUT_HEIGHT = /(?:^|;)\s*height:\s*([-\d.]+)em/;
const STRUT_ALIGN = /vertical-align:\s*([-\d.]+)em/;

/** 支柱（KaTeX の katex-strut。style の height と vertical-align）から、式の箱の高さ＋深さ（em）。行が分かれた式は支柱ごとの上と下の最大 */
export function katexBoxEm(strutStyles: readonly string[]): number {
  let top = 0;
  let depth = 0;
  for (const style of strutStyles) {
    const height = Number(STRUT_HEIGHT.exec(style)?.[1] ?? 0);
    const align = Number(STRUT_ALIGN.exec(style)?.[1] ?? 0);
    top = Math.max(top, height + align);
    depth = Math.max(depth, -align);
  }
  return top + depth;
}

const re = (r: RegExp) => `new RegExp(${JSON.stringify(r.source)}, ${JSON.stringify(r.flags)})`;

/**
 * スマホの WebView のページで、描いた式に同じ整えをするスクリプト（パソコンの katexOptions.ts の tidyRenderedMath と同じ手順を文字で書く。
 * Hermes では関数を文字に戻せないので手で書き、上の katexBoxEm と同じ結果になることを katexSettings.test.ts が確かめる）。
 * ページに kickoffTidyKatex(root)（katex.render のあとに呼ぶ）を置く。見えない文字は選べない・読み上げない形にし、読み上げ用の MathML の見えない部分は空にし、
 * 高すぎる行の中の式に TALL_MATH_CLASS を付ける
 */
export const TIDY_KATEX_SCRIPT = `const kickoffTidyKatex = (() => {
  const SEE_THROUGH = ${re(SEE_THROUGH)};
  const COLOR_PROPERTY = ${re(COLOR_PROPERTY)};
  const STRUT_HEIGHT = ${re(STRUT_HEIGHT)};
  const STRUT_ALIGN = ${re(STRUT_ALIGN)};
  const isSeeThroughStyle = (style) => style.split(";").some((decl) => {
    const colon = decl.indexOf(":");
    return colon >= 0 && COLOR_PROPERTY.test(decl.slice(0, colon).trim()) && SEE_THROUGH.test(decl.slice(colon + 1));
  });
  const katexBoxEm = (styles) => {
    let top = 0;
    let depth = 0;
    for (const style of styles) {
      const height = Number(STRUT_HEIGHT.exec(style)?.[1] ?? 0);
      const align = Number(STRUT_ALIGN.exec(style)?.[1] ?? 0);
      top = Math.max(top, height + align);
      depth = Math.max(depth, -align);
    }
    return top + depth;
  };
  const isHiddenMathml = (tagName, mathcolor) => tagName === "mphantom" || (typeof mathcolor === "string" && SEE_THROUGH.test(mathcolor));
  return (root) => {
    for (const el of root.querySelectorAll("[style]")) {
      if (!isSeeThroughStyle(el.getAttribute("style") ?? "")) continue;
      el.classList.add(${JSON.stringify(SEE_THROUGH_CLASS)});
      el.setAttribute("aria-hidden", "true");
    }
    for (const el of root.querySelectorAll("mphantom, [mathcolor]")) if (isHiddenMathml(el.localName, el.getAttribute("mathcolor"))) el.replaceChildren();
    for (const el of root.querySelectorAll(".katex")) {
      if (el.closest(".katex-display")) continue;
      const styles = Array.from(el.querySelectorAll(".katex-strut"), (s) => s.getAttribute("style") ?? "");
      if (katexBoxEm(styles) > ${INLINE_MATH_MAX_EM}) el.classList.add(${JSON.stringify(TALL_MATH_CLASS)});
    }
  };
})();`;

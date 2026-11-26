// KaTeX の設定と、描いた式の整え（返答の Markdown の rehype-katex と、ノートのライブプレビューの renderToString で同じものを使う）
import type { Element, Root } from "hast";
import { visit } from "unist-util-visit";
import { lengthMacros } from "./katexLengths";

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

/**
 * KaTeX に渡す設定。書き方の誤りは赤くせず、文字の色のまま元の式を出す。\href・\includegraphics など外へ出るものは trust: false で止める。
 * maxSize: \rule・\raisebox・\kern などに書いた大きさの上限（em）。KaTeX は正の大きさだけを丸めるので、負の大きさと縦の大きさは
 * katexLengths.ts のマクロで抑える（縦は 1 つ 3em・式ごとの合計 10em、横は ±10em）。式の外へ出た分は CSS で描かない（Markdown.css）。
 * maxExpand: マクロを展開する回数の上限（KaTeX の既定と同じ 1000）。\neq・\dfrac・\cdots なども 1 回と数えるので、
 * 行列・和・極限を並べた式は 40 個並べると 1000 を超える（500 では 20 個で超える）。1000 回でも、長い \def を展開し続ける式は 219ms で止まる（M2 Pro で測った）。
 * macros: 色を変える命令を色なしにし（COLOR_MACROS）、小さくするサイズの命令を何もしない形にし（SIZE_MACROS）、\scriptscriptstyle を \scriptstyle にし（STYLE_MACROS）、
 * 長さを取る命令の大きさを抑える（lengthMacros）。KaTeX は \gdef で渡した macros の中身を書き換え、lengthMacros は式ごとに縦の大きさを数えるので、描くたびに新しい写しを渡す
 * （KaTeX は描くたびに設定の macros を読むので、そのたびに getter が新しい写しを作る。式どうしで定義・数が残らないように）
 */
export const KATEX_OPTIONS = {
  throwOnError: false,
  errorColor: "inherit",
  strict: false,
  trust: false,
  maxSize: 10,
  maxExpand: 1000,
  get macros(): Record<string, string | ((context: object) => object)> {
    return { ...COLOR_MACROS, ...SIZE_MACROS, ...STYLE_MACROS, ...lengthMacros() };
  },
} as const;

/** 透明・透明度のある色（KaTeX が色に通すのは色の名前と #rgb・#rgba・#rrggbb・#rrggbbaa だけ） */
const SEE_THROUGH = /^\s*(?:transparent|#[0-9a-f]{4}|#[0-9a-f]{8})\s*$/i;
/** 文字の色の項目（背景・枠の色は文字を隠さないので見ない） */
const COLOR_PROPERTY = /^color$/i;

/** 透明な文字の要素に付けるクラス（Markdown.css・NoteEditor.unlayered.css が選べないようにする） */
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
 * rehype-katex のあとに、見えない文字（透明な色の文字）を、見えないまま場所だけ取る形で残しつつ、選べない・コピーに入らない形にする
 * rehype のプラグイン（式の見た目は変えない）。見た目の HTML は選べないクラスと aria-hidden を付け、
 * 画面に出ない読み上げ用の MathML は中身を空にする（選んでコピーすると MathML の文字も入るため）
 */
export function rehypeSafeMath() {
  return (tree: Root) => {
    visit(tree, "element", (node: Element) => {
      const style = node.properties.style;
      if (typeof style === "string" && isSeeThroughStyle(style)) {
        const classes = Array.isArray(node.properties.className) ? node.properties.className : [];
        node.properties.className = [...classes, SEE_THROUGH_CLASS];
        node.properties.ariaHidden = "true";
      }
      if (isHiddenMathml(node.tagName, node.properties.mathcolor)) node.children = [];
    });
  };
}

/** KaTeX が描いた DOM に、rehypeSafeMath と同じ整えをする（ノートのライブプレビュー。renderToString の HTML を入れたあと） */
export function hideSeeThroughMath(root: ParentNode): void {
  for (const el of root.querySelectorAll("[style]")) {
    if (!isSeeThroughStyle(el.getAttribute("style") ?? "")) continue;
    el.classList.add(SEE_THROUGH_CLASS);
    el.setAttribute("aria-hidden", "true");
  }
  for (const el of root.querySelectorAll("mphantom, [mathcolor]")) if (isHiddenMathml(el.localName, el.getAttribute("mathcolor"))) el.replaceChildren();
}

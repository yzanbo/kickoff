// KaTeX の設定と、描いた式の整え（返答の Markdown の rehype-katex と、ノートのライブプレビューの renderToString で同じものを使う）
import type { Element, Root } from "hast";
import { visit } from "unist-util-visit";

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
 * KaTeX に渡す設定。書き方の誤りは赤くせず、文字の色のまま元の式を出す。\href・\includegraphics など外へ出るものは trust: false で止める。
 * maxSize: \rule・\raisebox・\kern などに書いた大きさの上限（em）。KaTeX は正の大きさだけを丸める（\rule{500em}{500em} は 10em の箱、
 * \raisebox{30em} は 10em ほど上がる）。負の大きさ（\kern-50em・\raisebox{-30em}）は丸めないので、式の外へ出た分は CSS で描かない（Markdown.css）。
 * maxExpand: マクロを展開する回数の上限（KaTeX の既定と同じ 1000）。\neq・\dfrac・\cdots なども 1 回と数えるので、
 * 行列・和・極限を並べた式は 40 個並べると 1000 を超える（500 では 20 個で超える）。1000 回でも、長い \def を展開し続ける式は 219ms で止まる（M2 Pro で測った）。
 * macros: 色を変える命令を色なしにする（COLOR_MACROS）。KaTeX は \gdef で渡した macros の中身を書き換えるので、描くたびに新しい写しを渡す
 * （返答の rehype-katex もノートも設定を広げて渡すので、広げるたびに getter が新しい写しを作る。式どうしで定義が残らないように）
 */
export const KATEX_OPTIONS = {
  throwOnError: false,
  errorColor: "inherit",
  strict: false,
  trust: false,
  maxSize: 10,
  maxExpand: 1000,
  get macros(): Record<string, string> {
    return { ...COLOR_MACROS };
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

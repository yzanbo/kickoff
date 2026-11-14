// メモの Markdown 表示の数式（$…$・$$…$$・\(…\)・\[…\]）を KaTeX で描く飾り。どこが数式かは `@shared/markdown/mathGuard` の mathRanges
// （チャットの返答と同じ決まり）。カーソルが数式の中にあるときは、書いたとおりの記号を見せる（ライブプレビューの見出しなどと同じ）。
// 段落の数式が行をまたぐときは行の置き換えになるので、ViewPlugin ではなく StateField で飾る
import { Prec, StateEffect, StateField, type EditorState, type Range } from "@codemirror/state";
import { Decoration, EditorView, ViewPlugin, WidgetType, type DecorationSet } from "@codemirror/view";
import type KaTeX from "katex";
import { mathRanges, mayContainMath } from "@shared/markdown/mathGuard";

// KaTeX は大きいので、数式のあるメモを開いたときに初めて読み込む
let katex: typeof KaTeX | null = null;
let loading: Promise<void> | undefined;
const loadKatex = () =>
  (loading ??= Promise.all([import("katex"), import("katex/dist/katex.min.css")]).then(([m]) => {
    katex = m.default;
  }));

/** 描き直しの合図（KaTeX を読み込んだ・ピントが変わった） */
const refresh = StateEffect.define<{ focused: boolean }>();

class MathWidget extends WidgetType {
  constructor(
    readonly tex: string,
    readonly display: boolean,
  ) {
    super();
  }
  eq(other: MathWidget) {
    return other.tex === this.tex && other.display === this.display;
  }
  toDOM() {
    const el = document.createElement(this.display ? "div" : "span");
    el.className = this.display ? "cm-md-math cm-md-math-display" : "cm-md-math";
    // 書き方の誤りは赤くせず、文字の色のまま元の式を出す
    el.innerHTML = katex!.renderToString(this.tex, { displayMode: this.display, throwOnError: false, errorColor: "inherit", strict: false });
    return el;
  }
  ignoreEvent() {
    return false;
  }
}

function build(state: EditorState, focused: boolean): DecorationSet {
  const text = state.doc.toString();
  if (!katex || !mayContainMath(text)) return Decoration.none;
  const touches = (from: number, to: number) => focused && state.selection.ranges.some((r) => r.from <= to && r.to >= from);
  const out: Range<Decoration>[] = [];
  for (const m of mathRanges(text)) {
    if (touches(m.from, m.to)) continue;
    const start = state.doc.lineAt(m.from);
    const end = state.doc.lineAt(m.to);
    // 行をまるごと占める段落の数式は、行ごと置き換える（行をまたいでよい）
    const block = m.display && m.from === start.from && m.to === end.to;
    if (!block && start.number !== end.number) continue;
    out.push(Decoration.replace({ widget: new MathWidget(m.tex, m.display), block }).range(m.from, m.to));
  }
  return Decoration.set(out, true);
}

const mathField = StateField.define<{ focused: boolean; decorations: DecorationSet }>({
  create: (state) => ({ focused: false, decorations: build(state, false) }),
  update(value, tr) {
    const effect = tr.effects.find((e) => e.is(refresh));
    const focused = effect ? effect.value.focused : value.focused;
    if (!effect && !tr.docChanged && !tr.selection) return value;
    return { focused, decorations: build(tr.state, focused) };
  },
  provide: (field) => EditorView.decorations.from(field, (v) => v.decorations),
});

/** ピントの出入りと KaTeX の読み込みを、飾りの描き直しに伝える */
const mathWatcher = ViewPlugin.fromClass(
  class {
    constructor(readonly view: EditorView) {
      this.ensure();
    }
    update(u: { docChanged: boolean; focusChanged: boolean; view: EditorView }) {
      if (u.focusChanged) queueMicrotask(() => this.notify());
      if (u.docChanged) this.ensure();
    }
    /** 数式があれば KaTeX を読み込み、読み込んだら描き直す */
    ensure() {
      if (katex || !mayContainMath(this.view.state.doc.toString())) return;
      void loadKatex().then(() => this.notify());
    }
    notify() {
      this.view.dispatch({ effects: refresh.of({ focused: this.view.hasFocus }) });
    }
  },
);

/** メモの Markdown 表示の数式（ライブプレビューの記号の飾りより前に置く。数式の中の _ ・ * を斜体の印として隠さないように） */
export const liveMath = [Prec.high(mathField), mathWatcher];

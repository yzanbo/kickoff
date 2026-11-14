// メモの Markdown 表示の数式（$…$・$$…$$・\(…\)・\[…\]）と Mermaid の塊（```mermaid）を図にする飾り。
// 数式の場所は `@shared/markdown/mathGuard` の mathRanges（チャットの返答と同じ決まり）を KaTeX で、Mermaid はチャットと同じ renderMermaid で描く。
// カーソルがその中にあるときは、書いたとおりの記号を見せる（ライブプレビューの見出しなどと同じ）。行をまたいで置き換えるので、ViewPlugin ではなく StateField で飾る
import { Prec, StateEffect, StateField, type EditorState, type Range } from "@codemirror/state";
import { Decoration, EditorView, ViewPlugin, WidgetType, type DecorationSet } from "@codemirror/view";
import type KaTeX from "katex";
import { mathRanges, mayContainMath } from "@shared/markdown/mathGuard";
import { readAppliedTheme, subscribeAppliedTheme, type AppliedTheme } from "@/lib/appliedTheme";
import { renderMermaid } from "@/ui/markdown/mermaid/renderMermaid";
import { mermaidBlocks } from "./mermaidBlocks";

// KaTeX は大きいので、数式のあるメモを開いたときに初めて読み込む
let katex: typeof KaTeX | null = null;
let loading: Promise<void> | undefined;
const loadKatex = () =>
  (loading ??= Promise.all([import("katex"), import("katex/dist/katex.min.css")]).then(([m]) => {
    katex = m.default;
  }));

/** 描き直しの合図（KaTeX を読み込んだ・ピントが変わった・テーマが変わった） */
const refresh = StateEffect.define<{ focused: boolean; theme: AppliedTheme }>();

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

/** Mermaid の図（描くまでは枠だけ。描けなければ書き方の誤りと元の文） */
class MermaidWidget extends WidgetType {
  constructor(
    readonly code: string,
    readonly theme: AppliedTheme,
  ) {
    super();
  }
  eq(other: MermaidWidget) {
    return other.code === this.code && other.theme === this.theme;
  }
  toDOM() {
    const el = document.createElement("div");
    el.className = "cm-md-mermaid";
    el.setAttribute("role", "img");
    el.setAttribute("aria-label", "Mermaid の図");
    // 図の CSS がメモに漏れず、メモの CSS も図に効かないよう Shadow DOM に入れる（チャットの図と同じ）
    const root = el.attachShadow({ mode: "open" });
    root.innerHTML = `<div class="cm-md-mermaid-wait"></div>`;
    renderMermaid(this.code, this.theme).then(
      (svg) => {
        root.innerHTML = `<style>:host > svg { display: block; max-width: 100%; height: auto; margin-inline: auto; }</style>${svg}`;
      },
      () => {
        el.classList.add("failed");
        root.innerHTML = `<style>pre { margin: 0; white-space: pre-wrap; font: 12px/1.5 var(--mono, monospace); }</style><div>Mermaid の図を描けませんでした（書き方を確かめてください）</div>`;
        const pre = document.createElement("pre");
        pre.textContent = this.code;
        root.append(pre);
      },
    );
    return el;
  }
  ignoreEvent() {
    return false;
  }
}

interface RichState {
  focused: boolean;
  theme: AppliedTheme;
  decorations: DecorationSet;
}

function build(state: EditorState, focused: boolean, theme: AppliedTheme): DecorationSet {
  const text = state.doc.toString();
  const touches = (from: number, to: number) => focused && state.selection.ranges.some((r) => r.from <= to && r.to >= from);
  const out: Range<Decoration>[] = [];
  // Mermaid の塊（行をまるごと置き換える）。数式はこの外だけを探す
  const blocks = text.includes("mermaid") ? mermaidBlocks(text) : [];
  for (const b of blocks) {
    if (touches(b.from, b.to) || !b.code.trim()) continue;
    out.push(Decoration.replace({ widget: new MermaidWidget(b.code, theme), block: true }).range(b.from, b.to));
  }
  if (katex && mayContainMath(text)) {
    for (const m of mathRanges(text)) {
      if (touches(m.from, m.to) || blocks.some((b) => m.from < b.to && m.to > b.from)) continue;
      const start = state.doc.lineAt(m.from);
      const end = state.doc.lineAt(m.to);
      // 行をまるごと占める段落の数式は、行ごと置き換える（行をまたいでよい）
      const block = m.display && m.from === start.from && m.to === end.to;
      if (!block && start.number !== end.number) continue;
      out.push(Decoration.replace({ widget: new MathWidget(m.tex, m.display), block }).range(m.from, m.to));
    }
  }
  return Decoration.set(out, true);
}

const richField = StateField.define<RichState>({
  create: (state) => {
    const theme = readAppliedTheme();
    return { focused: false, theme, decorations: build(state, false, theme) };
  },
  update(value, tr) {
    const effect = tr.effects.find((e) => e.is(refresh));
    if (!effect && !tr.docChanged && !tr.selection) return value;
    const { focused, theme } = effect ? effect.value : value;
    return { focused, theme, decorations: build(tr.state, focused, theme) };
  },
  provide: (field) => EditorView.decorations.from(field, (v) => v.decorations),
});

/** ピントの出入り・テーマの変化と KaTeX の読み込みを、飾りの描き直しに伝える */
const richWatcher = ViewPlugin.fromClass(
  class {
    private readonly stopTheme: () => void;
    constructor(readonly view: EditorView) {
      this.ensure();
      this.stopTheme = subscribeAppliedTheme(() => this.notify());
    }
    update(u: { docChanged: boolean; focusChanged: boolean; view: EditorView }) {
      if (u.focusChanged) queueMicrotask(() => this.notify());
      if (u.docChanged) this.ensure();
    }
    destroy() {
      this.stopTheme();
    }
    /** 数式があれば KaTeX を読み込み、読み込んだら描き直す */
    ensure() {
      if (katex || !mayContainMath(this.view.state.doc.toString())) return;
      void loadKatex().then(() => this.notify());
    }
    notify() {
      this.view.dispatch({ effects: refresh.of({ focused: this.view.hasFocus, theme: readAppliedTheme() }) });
    }
  },
);

/** メモの Markdown 表示の数式と Mermaid の図（ライブプレビューの記号の飾りより前に置く。数式の中の _ ・ * や、コードの塊の飾りと重ねないように） */
export const liveRich = [Prec.high(richField), richWatcher];

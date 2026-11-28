// ノートの Markdown 表示のコードの塊に、返答と同じ色（同じ色付けの部品・同じ配色）と、言語名とコピーの帯を付ける飾り。
// その場で書けるまま色を付ける。色は Worker から少し遅れて届くので、届くまでは前の色を書き換えに合わせて動かして残す（色がいったん消えない）。
// 帯は開きの ``` の行の場所に出し、カーソルがその行に入ると「```言語名」の文字に替わる（高さは変わらない）
import { syntaxTree } from "@codemirror/language";
import { StateEffect, type Range } from "@codemirror/state";
import { Decoration, EditorView, ViewPlugin, type DecorationSet, type ViewUpdate } from "@codemirror/view";
import { highlightLines, peekHighlight } from "@/foundation/ui/code/highlight";
import { fenceLanguage } from "@/foundation/ui/code/languages";
import { CopyButton } from "@/foundation/ui/kit/CopyButton";
import { readAppliedTheme, subscribeAppliedTheme, type AppliedTheme } from "@/foundation/ui/theme/appliedTheme";
import { codeBlocks, tokenRanges } from "./codeBlocks";
import { fenceInfoLanguage, isMermaidBlock } from "./mermaidBlocks";
import { docText } from "./noteDoc";
import { PortalWidget } from "./widgetPortals";

/** 色が届いた・テーマが変わった（組み直しの合図） */
const recolor = StateEffect.define<null>();

/** 開きの ``` の行の代わりの帯（言語名とコピーのボタン。返答のコードの帯と同じ部品とクラス） */
class CodeHeadWidget extends PortalWidget {
  constructor(
    readonly lang: string,
    readonly code: string,
    /** 開きの行の字下げ（リストの中の塊。帯の幅をその分だけ縮めて、1 行に収める） */
    readonly indent: number,
  ) {
    super("span", "cm-code-head");
  }
  eq(other: CodeHeadWidget) {
    return other.lang === this.lang && other.code === this.code && other.indent === this.indent;
  }
  protected shape(el: HTMLElement) {
    el.style.width = this.indent ? `calc(100% - ${this.indent}ch - 4px)` : "";
  }
  protected content() {
    return (
      <>
        <span className="code-block-lang">{this.lang}</span>
        <CopyButton text={this.code} label="コードをコピー" className="code-block-copy" />
      </>
    );
  }
  updateDOM(el: HTMLElement, view: EditorView) {
    this.render(el, view);
    return true;
  }
  // コピーのボタンを押せるように、帯の中の押下は本体が扱わない
  ignoreEvent(e: Event) {
    return e.type !== "mousedown" || !!(e.target as HTMLElement).closest("button");
  }
}

class CodeHighlighter {
  colors: DecorationSet = Decoration.none;
  heads: DecorationSet = Decoration.none;
  private theme: AppliedTheme = readAppliedTheme();
  private readonly requested = new Set<string>();
  private readonly stopTheme: () => void;

  constructor(readonly view: EditorView) {
    this.build();
    this.stopTheme = subscribeAppliedTheme(() => {
      this.theme = readAppliedTheme();
      queueMicrotask(() => this.view.dispatch({ effects: recolor.of(null) }));
    });
  }

  update(u: ViewUpdate) {
    // 色は書き換えに合わせて動かしておき、組み直すまで残す
    if (u.docChanged) this.colors = this.colors.map(u.changes);
    const recolored = u.transactions.some((t) => t.effects.some((e) => e.is(recolor)));
    if (u.docChanged || u.viewportChanged || u.selectionSet || u.focusChanged || recolored || syntaxTree(u.startState) !== syntaxTree(u.state)) this.build();
  }

  destroy() {
    this.stopTheme();
  }

  private build() {
    const { state } = this.view;
    const text = docText(state);
    const { from, to } = this.view.viewport;
    const blocks = codeBlocks(syntaxTree(state), text, from, to);
    const head = state.selection.main.head;
    const active = this.view.hasFocus ? state.doc.lineAt(head).from : -1;
    const colors: Range<Decoration>[] = [];
    const heads: Range<Decoration>[] = [];
    for (const block of blocks) {
      // Mermaid の塊は図にする（previewRich）
      if (isMermaidBlock(block)) continue;
      const info = fenceInfoLanguage(block.info);
      // 帯（カーソルが開きの行にあれば元の文字）
      if (block.headFrom !== active) {
        const indent = text.slice(block.headFrom, block.headTo).search(/\S/);
        heads.push(Decoration.replace({ widget: new CodeHeadWidget(info, block.code, Math.max(0, indent)) }).range(block.headFrom + Math.max(0, indent), block.headTo));
      }
      const lang = fenceLanguage(info);
      if (!lang || !block.code) continue;
      const tokens = peekHighlight(block.code, lang, this.theme);
      if (tokens) {
        for (const r of tokenRanges(block, tokens)) colors.push(Decoration.mark({ attributes: { style: r.style } }).range(r.from, r.to));
        continue;
      }
      if (tokens === undefined) this.request(block.code, lang);
      // 色が届くまでは、前の色（書き換えに合わせて動かしたもの）を残す
      this.colors.between(block.headTo, block.to, (f, t, value) => void colors.push(value.range(f, t)));
    }
    this.colors = Decoration.set(colors, true);
    this.heads = Decoration.set(heads, true);
  }

  /** 色付けを頼む（同じ中身は 1 回だけ。届いたら組み直す） */
  private request(code: string, lang: string) {
    const key = `${this.theme}\u0000${lang}\u0000${code}`;
    if (this.requested.has(key)) return;
    this.requested.add(key);
    void highlightLines(code, lang, this.theme).then(
      () => {
        this.requested.delete(key);
        this.view.dispatch({ effects: recolor.of(null) });
      },
      () => this.requested.delete(key),
    );
  }
}

/** コードの塊の色と帯（Markdown 表示のときだけ入れる） */
export const codeHighlight = ViewPlugin.fromClass(CodeHighlighter, {
  provide: (plugin) => [
    EditorView.decorations.of((view) => view.plugin(plugin)?.colors ?? Decoration.none),
    EditorView.decorations.of((view) => view.plugin(plugin)?.heads ?? Decoration.none),
  ],
});

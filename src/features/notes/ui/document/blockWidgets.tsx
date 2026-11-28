// ノートの Markdown 表示で、表などのまとまりを置き換えて描く飾り（中身は返答の表示と同じ処理で描く。NoteTable）。
// 行をまたいで置き換えるので StateField で出す。読み取りの木が育った（見えていない所まで読み進めた）ときも組み直す
import { syntaxTree } from "@codemirror/language";
import { StateEffect, StateField, type EditorState, type Range } from "@codemirror/state";
import { Decoration, EditorView, ViewPlugin, WidgetType, type DecorationSet, type ViewUpdate } from "@codemirror/view";
import { NoteTable } from "./NoteTable";
import { tableBlocks, type TableBlock } from "./tableBlocks";
import { widgetPortalsFacet, type WidgetPortals } from "./widgetPortals";

/** 表 1 つを描く飾り（中身は React の部品。widgetPortals で描く） */
class TableWidget extends WidgetType {
  constructor(readonly block: TableBlock) {
    super();
  }
  eq(other: TableWidget) {
    return other.block.markdown === this.block.markdown && other.block.prefix === this.block.prefix;
  }
  // 描く前の高さの見込み（行の数ぶん。描いたら測り直す）
  get estimatedHeight() {
    return this.block.rows.length * 30;
  }
  toDOM(view: EditorView) {
    const el = document.createElement("div");
    el.className = "cm-note-table";
    // リストの中の表は、その字下げの場所に描く
    const indent = this.block.prefix.replace(/[>]/g, " ").length;
    if (indent) el.style.paddingInlineStart = `${indent}ch`;
    const portals = view.state.facet(widgetPortalsFacet);
    if (portals) {
      portalsByElement.set(el, portals);
      portals.mount(el, <NoteTable markdown={this.block.markdown} view={view} />);
    }
    return el;
  }
  destroy(el: HTMLElement) {
    portalsByElement.get(el)?.unmount(el);
  }
  // 押したら編集の部品がカーソルを置く（中に入ると元の文字に戻る）
  ignoreEvent() {
    return false;
  }
}

/** 要素を描いた portals（destroy では view を受け取れないので、描いたときに覚える） */
const portalsByElement = new WeakMap<HTMLElement, WidgetPortals>();

/** 描き直しの合図（ピントが変わった・読み取りの木が育った） */
const refresh = StateEffect.define<{ focused: boolean }>();

interface BlocksState {
  focused: boolean;
  decorations: DecorationSet;
}

function build(state: EditorState, focused: boolean): BlocksState {
  const text = state.doc.toString();
  const tables = tableBlocks(syntaxTree(state), text);
  // カーソル（選んだ範囲）が中にある表は元の文字のまま（ピントがないときは、どれも描く）
  const touches = (from: number, to: number) => focused && state.selection.ranges.some((r) => r.from <= to && r.to >= from);
  const out: Range<Decoration>[] = [];
  for (const t of tables) {
    if (touches(t.from, t.to)) continue;
    out.push(Decoration.replace({ widget: new TableWidget(t), block: true }).range(t.from, t.to));
  }
  return { focused, decorations: Decoration.set(out, true) };
}

const blocksField = StateField.define<BlocksState>({
  create: (state) => build(state, false),
  update(value, tr) {
    const effect = tr.effects.find((e) => e.is(refresh));
    if (!effect && !tr.docChanged && !tr.selection && syntaxTree(tr.startState) === syntaxTree(tr.state)) return value;
    return build(tr.state, effect ? effect.value.focused : value.focused);
  },
  provide: (field) => EditorView.decorations.from(field, (v) => v.decorations),
});

/** ピントの出入りと、読み取りの木が文を変えずに育ったことを、組み直しに伝える */
const blocksWatcher = ViewPlugin.fromClass(
  class {
    constructor(readonly view: EditorView) {}
    update(u: ViewUpdate) {
      const grew = !u.docChanged && syntaxTree(u.startState) !== syntaxTree(u.state);
      if (u.focusChanged || grew) queueMicrotask(() => this.view.dispatch({ effects: refresh.of({ focused: this.view.hasFocus }) }));
    }
  },
);

/** 表などのまとまりを置き換えて描く飾り（Markdown 表示のときだけ入れる） */
export const blockWidgets = [blocksField, blocksWatcher];

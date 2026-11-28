// ノートの Markdown 表示で、表などのまとまりを置き換えて描く飾り（中身は返答の表示と同じ処理で描く。NoteTable）。
// 表はカーソルが入っても表のまま描き、開いているセルだけをその場で書く部品にする（tableState・cellEditor）。
// 行をまたいで置き換えるので StateField で出す。読み取りの木が育った（見えていない所まで読み進めた）ときも組み直す
import { syntaxTree } from "@codemirror/language";
import { Prec, StateField, type EditorState, type Range } from "@codemirror/state";
import { Decoration, EditorView, keymap, WidgetType, type DecorationSet } from "@codemirror/view";
import { NoteTable } from "./NoteTable";
import type { TableBlock } from "./tableBlocks";
import { getSearchQuery, searchPanelOpen } from "@codemirror/search";
import { cellAt, cellRange, markdownWithoutCell, type CellAddress } from "./tableModel";
import { cellSync } from "./cellEditor";
import { enterTableKeymap } from "./cellKeys";
import { focusWatcher, openCellOf, tableCellField } from "./tableField";
import { HtmlBlock } from "./HtmlBlock";
import { docText, htmlBlocksOf, tablesOf, type OpenCell } from "./tableState";
import { mountInEditor, unmountFromEditor } from "./widgetPortals";

/** 表 1 つを描く飾り（中身は React の部品。widgetPortals で描く） */
class TableWidget extends WidgetType {
  constructor(
    readonly block: TableBlock,
    /** 描く Markdown（開いているセルの中身は抜く。そのセルを書いても描き直さない） */
    readonly markdown: string,
    /** この表で開いているセル（なければ null） */
    readonly open: CellAddress | null,
    /** ⌘F の当たりのあるセル（「行,列」を ; でつないだもの。なければ空） */
    readonly matches: string,
  ) {
    super();
  }
  eq(other: TableWidget) {
    return (
      other.markdown === this.markdown &&
      other.block.prefix === this.block.prefix &&
      other.open?.row === this.open?.row &&
      other.open?.col === this.open?.col &&
      other.matches === this.matches
    );
  }
  // 描く前の高さの見込み（行の数ぶん。描いたら測り直す）
  get estimatedHeight() {
    return this.block.rows.length * 30;
  }
  private render(el: HTMLElement, view: EditorView) {
    mountInEditor(view, el, <NoteTable markdown={this.markdown} view={view} open={this.open} matches={this.matches} />);
  }
  toDOM(view: EditorView) {
    const el = document.createElement("div");
    el.className = "cm-note-table";
    // リストの中の表は、その字下げの場所に描く
    const indent = this.block.prefix.replace(/[>]/g, " ").length;
    if (indent) el.style.paddingInlineStart = `${indent}ch`;
    this.render(el, view);
    return el;
  }
  // 中身が変わっても要素は作り直さない（開いているセルの書く部品・横のスクロールを残す）
  updateDOM(el: HTMLElement, view: EditorView) {
    this.render(el, view);
    return true;
  }
  destroy(el: HTMLElement) {
    unmountFromEditor(el);
  }
  // 中の押下・キー・入力は表の部品とセルの書く部品が受ける（本体は扱わない）
  ignoreEvent() {
    return true;
  }
}

/** HTML のまとまり 1 つを描く飾り（返答の表示と同じ Markdown の部品で。カーソルが入ると元の文字） */
class HtmlBlockWidget extends WidgetType {
  constructor(readonly source: string) {
    super();
  }
  eq(other: HtmlBlockWidget) {
    return other.source === this.source;
  }
  toDOM(view: EditorView) {
    const el = document.createElement("div");
    el.className = "cm-note-html";
    mountInEditor(view, el, <HtmlBlock source={this.source} view={view} />);
    return el;
  }
  destroy(el: HTMLElement) {
    unmountFromEditor(el);
  }
  // 中のたたむ部分（details）の開け閉めは部品が受け、ほかを押すと本体がカーソルを置く（元の文字に戻る）
  ignoreEvent(e: Event) {
    return !!(e.target as HTMLElement).closest("summary, a, button");
  }
}

/** ⌘F の当たりのある表のセル（置き換えて描いた所には当たりの色が出ないので、セルに印を付ける） */
function searchMatches(state: EditorState, table: TableBlock): string {
  if (!searchPanelOpen(state)) return "";
  const query = getSearchQuery(state);
  if (!query.valid || !query.search) return "";
  const text = docText(state);
  const cells = new Set<string>();
  const cursor = query.getCursor(state, table.from, table.to);
  for (let next = cursor.next(); !next.done; next = cursor.next()) {
    const at = cellAt(text, table, next.value.from);
    cells.add(`${at.row},${at.col}`);
  }
  return [...cells].join(";");
}

function decorate(state: EditorState, open: OpenCell | null): DecorationSet {
  const text = docText(state);
  const out: Range<Decoration>[] = [];
  // HTML のまとまり（カーソルが中にあれば元の文字）。中の表は表として描かない
  const focused = state.field(tableCellField, false)?.focused ?? false;
  const html = htmlBlocksOf(state);
  for (const h of html) {
    if (focused && state.selection.ranges.some((r) => r.from <= h.to && r.to >= h.from)) continue;
    out.push(Decoration.replace({ widget: new HtmlBlockWidget(h.source), block: true }).range(h.from, h.to));
  }
  for (const t of tablesOf(state)) {
    if (html.some((h) => t.from < h.to && t.to > h.from)) continue;
    const here = open && open.tableFrom === t.from ? { row: open.row, col: open.col } : null;
    const range = here && cellRange(text, t, here);
    const markdown = range ? markdownWithoutCell(text, t, range) : t.markdown;
    out.push(Decoration.replace({ widget: new TableWidget(t, markdown, here, searchMatches(state, t)), block: true }).range(t.from, t.to));
  }
  return Decoration.set(out, true);
}

const decorationsField = StateField.define<DecorationSet>({
  create: (state) => decorate(state, openCellOf(state)),
  update(value, tr) {
    const open = openCellOf(tr.state);
    // 読み取りの木が育った（見えていない所まで読み進めた）ときも組み直す（文が変わらなくても表が見つかる）
    const grew = syntaxTree(tr.startState) !== syntaxTree(tr.state);
    // ⌘F の欄を開け閉めした・探す文が変わったときも、当たりのセルの印を付け直す
    const searched = searchPanelOpen(tr.startState) !== searchPanelOpen(tr.state) || !getSearchQuery(tr.startState).eq(getSearchQuery(tr.state));
    // HTML のまとまりがあれば、カーソルの出入り・ピントでも組み直す（入ると元の文字）
    const moved = (tr.selection || tr.effects.length > 0) && htmlBlocksOf(tr.state).length > 0;
    if (!tr.docChanged && !grew && !searched && !moved && open === openCellOf(tr.startState)) return value;
    return decorate(tr.state, open);
  },
  provide: (field) => EditorView.decorations.from(field),
});

/** 表などのまとまりを置き換えて描く飾り（Markdown 表示のときだけ入れる） */
export const blockWidgets = [tableCellField, focusWatcher, decorationsField, cellSync, Prec.high(keymap.of(enterTableKeymap))];

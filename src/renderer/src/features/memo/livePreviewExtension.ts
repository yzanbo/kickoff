// メモの Markdown 表示（Obsidian のライブプレビューと同じ）の CodeMirror の飾り。どこをどう見せるかは純粋関数の previewMarks（livePreview.ts）が決め、
// ここではエディタの飾り（隠す・行と文字の見た目・「•」・チェックボックス・区切り線）に直す。カーソルのある行は記号をそのまま見せる（ピントがないときは、どの行も整えて見せる）
import { syntaxTree } from "@codemirror/language";
import type { Range } from "@codemirror/state";
import { Decoration, EditorView, ViewPlugin, WidgetType, type DecorationSet, type ViewUpdate } from "@codemirror/view";
import { previewMarks, type PreviewMark } from "./livePreview";

/** 箇条書きの記号の代わりの「•」 */
class BulletWidget extends WidgetType {
  toDOM() {
    const span = document.createElement("span");
    span.className = "cm-md-bullet";
    span.textContent = "•";
    return span;
  }
  eq() {
    return true;
  }
}

/** タスクの [ ] / [x] の代わりのチェックボックス（押すと、ファイルの [ ] と [x] を書き換える） */
class TaskWidget extends WidgetType {
  constructor(
    readonly checked: boolean,
    readonly from: number,
    readonly to: number,
  ) {
    super();
  }
  toDOM(view: EditorView) {
    const box = document.createElement("input");
    box.type = "checkbox";
    box.className = "cm-md-task";
    box.checked = this.checked;
    box.setAttribute("aria-label", this.checked ? "済み（押すと戻す）" : "やること（押すと済みにする）");
    // 押してもカーソルを動かさない（行が記号の表示に変わらないように）
    box.addEventListener("mousedown", (e) => e.preventDefault());
    box.addEventListener("click", (e) => {
      e.preventDefault();
      view.dispatch({ changes: { from: this.from, to: this.to, insert: this.checked ? "[ ]" : "[x]" } });
    });
    return box;
  }
  eq(other: TaskWidget) {
    return other.checked === this.checked && other.from === this.from && other.to === this.to;
  }
  ignoreEvent() {
    return true;
  }
}

/** 区切り線（---）の代わりの線 */
class RuleWidget extends WidgetType {
  toDOM() {
    const span = document.createElement("span");
    span.className = "cm-md-rule";
    return span;
  }
  eq() {
    return true;
  }
}

const BULLET = Decoration.replace({ widget: new BulletWidget() });
const RULE = Decoration.replace({ widget: new RuleWidget() });
const HIDE = Decoration.replace({});

function decorationOf(mark: PreviewMark): Range<Decoration> {
  switch (mark.kind) {
    case "hide":
      return HIDE.range(mark.from, mark.to);
    case "line":
      return Decoration.line({ class: `cm-${mark.cls}` }).range(mark.at);
    case "span":
      return Decoration.mark({ class: `cm-${mark.cls}` }).range(mark.from, mark.to);
    case "bullet":
      return BULLET.range(mark.from, mark.to);
    case "task":
      return Decoration.replace({ widget: new TaskWidget(mark.checked, mark.from, mark.to) }).range(mark.from, mark.to);
    case "rule":
      return RULE.range(mark.from, mark.to);
  }
}

function build(view: EditorView): DecorationSet {
  const { state } = view;
  // カーソル（選んでいる範囲）のある行。ピントがなければ、どの行も整えて見せる
  const active = new Set<number>();
  if (view.hasFocus) {
    for (const r of state.selection.ranges) {
      for (let n = state.doc.lineAt(r.from).number; n <= state.doc.lineAt(r.to).number; n++) active.add(n);
    }
  }
  const isActive = (pos: number) => active.has(state.doc.lineAt(pos).number);
  const tree = syntaxTree(state);
  const text = state.doc.toString();
  // 見えている範囲（いくつかに分かれていても、最初から最後までを 1 回でたどる。同じ要素を 2 回飾らないように）
  const visible = view.visibleRanges;
  const from = visible[0]?.from ?? 0;
  const to = visible[visible.length - 1]?.to ?? state.doc.length;
  const ranges: Range<Decoration>[] = previewMarks(tree, text, isActive, from, to).map(decorationOf);
  return Decoration.set(ranges, true);
}

/** Markdown 表示の飾り（MemoEditor が、表示の切り替えで付け外しする） */
export const livePreview = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = build(view);
    }
    update(u: ViewUpdate) {
      if (u.docChanged || u.viewportChanged || u.selectionSet || u.focusChanged || syntaxTree(u.startState) !== syntaxTree(u.state)) {
        this.decorations = build(u.view);
      }
    }
  },
  { decorations: (v) => v.decorations },
);

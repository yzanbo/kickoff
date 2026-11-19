// SQL の入力欄で、⌘↵ で流れる文（カーソルのある文。選んでいればその範囲）の行の左に緑の線を引く CodeMirror の飾り
import { RangeSetBuilder, type EditorState, type Extension } from "@codemirror/state";
import { Decoration, EditorView, ViewPlugin, type DecorationSet, type ViewUpdate } from "@codemirror/view";
import { splitStatements, statementAt } from "@shared/database/sqlStatements";
import type { DbEngine } from "@shared/types";

/** これより長い文は飾らない（カーソルを動かすたびに文に分けるため） */
const MARK_MAX_CHARS = 200_000;

const line = Decoration.line({ class: "cm-run-target" });

/** 流れる範囲（選んでいればその範囲、なければカーソルの文。空・文がなければ null） */
export function runTargetRange(state: EditorState, engine: DbEngine): { from: number; to: number } | null {
  const sel = state.selection.main;
  if (!sel.empty) return { from: sel.from, to: sel.to };
  const text = state.doc.toString();
  if (text.trim() === "" || text.length > MARK_MAX_CHARS) return null;
  const s = statementAt(splitStatements(text, engine), sel.from);
  return s ? { from: s.start, to: s.end } : null;
}

function build(state: EditorState, engine: DbEngine): DecorationSet {
  const range = runTargetRange(state, engine);
  if (!range) return Decoration.none;
  const builder = new RangeSetBuilder<Decoration>();
  const first = state.doc.lineAt(range.from).number;
  const last = state.doc.lineAt(Math.max(range.from, range.to - (range.to > range.from ? 1 : 0))).number;
  for (let n = first; n <= last; n++) builder.add(state.doc.line(n).from, state.doc.line(n).from, line);
  return builder.finish();
}

/** 流れる文の行の飾り（文・カーソルが変わったら引き直す） */
export function runTargetMark(engine: DbEngine): Extension {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      constructor(view: EditorView) {
        this.decorations = build(view.state, engine);
      }
      update(u: ViewUpdate) {
        if (u.docChanged || u.selectionSet) this.decorations = build(u.state, engine);
      }
    },
    { decorations: (v) => v.decorations },
  );
}

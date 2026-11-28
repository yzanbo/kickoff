import { createContext, useContext, useLayoutEffect, useRef, type ComponentProps, type MouseEvent, type ReactElement } from "react";
import type { EditorView } from "@codemirror/view";
import type { Components } from "react-markdown";
import { COMPONENTS } from "@/foundation/ui/markdown/markdownComponents";
import { createCellEditor, destroyCellEditor } from "./cellEditor";
import { openCell } from "./cellKeys";
import type { CellAddress } from "./tableModel";

/** 描いている表の様子（編集の部品と、この表で開いているセル） */
interface NoteTableContextValue {
  view: EditorView;
  open: CellAddress | null;
}

export const NoteTableContext = createContext<NoteTableContextValue | null>(null);

type CellProps = ComponentProps<"td"> & { node?: { tagName?: string; properties?: Record<string, unknown> } };

/**
 * 開いているセルの中の書く部品（作るのは 1 回。開くセルが替わると React が外して作り直す）。
 * 描いた直後に作ってピントを移す（前のセルの部品が消えてピントが外へ出た扱いになり、開いたセルが閉じないように）
 */
function CellEditorHost({ view }: { view: EditorView }) {
  const host = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (!host.current) return;
    const cell = createCellEditor(view, host.current);
    return () => destroyCellEditor(view, cell);
  }, [view]);
  return <div ref={host} className="note-cell-editor" />;
}

/**
 * 表のセル（th・td）。押すとそのセルを開いて書ける。開いているセルは、元の文字を書く部品に替える。
 * ⌘ を押しながらリンクを押したときは開かない（リンクを開く）
 */
function TableCell({ node, children, ...props }: CellProps) {
  const ctx = useContext(NoteTableContext);
  const Tag = node?.tagName === "th" ? "th" : "td";
  const row = Number(node?.properties?.dataRow);
  const col = Number(node?.properties?.dataCol);
  if (!ctx) return <Tag {...props}>{children}</Tag>;
  const { view, open } = ctx;
  if (open && open.row === row && open.col === col) {
    return (
      <Tag {...props} className="note-cell-open">
        <CellEditorHost view={view} />
      </Tag>
    );
  }
  const press = (e: MouseEvent<HTMLElement>) => {
    if (e.button !== 0 || (e.metaKey && (e.target as Element).closest("a"))) return;
    e.preventDefault();
    openCell(view, view.posAtDOM(e.currentTarget), { row, col }, "end");
  };
  return (
    <Tag {...props} onMouseDown={press}>
      {children}
    </Tag>
  );
}

/** 表の中のリンク: 押してもすぐには開かない（押したセルを開いて書く）。⌘ を押しながらなら、返答の表示と同じく開く */
const MarkdownLink = COMPONENTS.a as (props: ComponentProps<"a"> & { node?: unknown }) => ReactElement;
const TableLink = (props: ComponentProps<"a"> & { node?: unknown }) => {
  const guard = (e: MouseEvent) => {
    if (!e.metaKey) e.preventDefault();
  };
  return (
    <span onClickCapture={guard} onAuxClickCapture={guard}>
      <MarkdownLink {...props} />
    </span>
  );
};

/** 表を描く部品（返答の表示の部品に、セルとリンクの扱いを足したもの。描くたびに作り直さない） */
export const TABLE_COMPONENTS: Components = { ...COMPONENTS, th: TableCell, td: TableCell, a: TableLink };

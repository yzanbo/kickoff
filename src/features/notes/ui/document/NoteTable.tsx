import type { Element, Root } from "hast";
import { toJsxRuntime } from "hast-util-to-jsx-runtime";
import { useLayoutEffect, useRef } from "react";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import type { EditorView } from "@codemirror/view";
import { convertTexDelimiters, mayContainMath } from "@shared/foundation/markdown/mathGuard";
import { markdownToHast, pipelineOf } from "@/foundation/ui/markdown/markdownProcessor";
import { useMathPlugins } from "@/foundation/ui/markdown/math/useMathPlugins";
import { Plus } from "lucide-react";
import { IconButton } from "@/foundation/ui/kit/IconButton";
import { appendColumn, appendRow } from "./tableActions";
import { NoteTableContext, TABLE_COMPONENTS } from "./TableCell";
import type { CellAddress } from "./tableModel";

/**
 * 表のセルに、何行目・何列目か（data-row・data-col。見出しの行が 0、区切りの行は数えない）を付ける。
 * 足りないセルは返答の表示と同じく空のセルで描かれるので、位置でなく並びの順で数える
 */
function markCells(tree: Root): void {
  let row = 0;
  const visitRows = (node: Root | Element) => {
    for (const child of node.children) {
      if (child.type !== "element") continue;
      if (child.tagName === "tr") {
        let col = 0;
        for (const cell of child.children) {
          if (cell.type !== "element" || (cell.tagName !== "th" && cell.tagName !== "td")) continue;
          cell.properties.dataRow = row;
          cell.properties.dataCol = col++;
        }
        row++;
      } else visitRows(child);
    }
  };
  visitRows(tree);
}

/**
 * ノートの表を、返答の表示と同じ処理（読み方・中の HTML の一覧・リンク・数式・部品）で描く。
 * open はこの表で開いているセル（そのセルは書く部品に替える）、matches は ⌘F の当たりのあるセル（「行,列」を ; でつないだもの）。描き終えたら編集の部品に高さを測り直させる（置き換えた所の高さが変わるため）
 */
export function NoteTable({ markdown, view, open, matches }: { markdown: string; view: EditorView; open: CellAddress | null; matches: string }) {
  const hasMath = mayContainMath(markdown);
  const math = useMathPlugins(hasMath);
  const withMath = hasMath && math !== null;
  const pipeline = pipelineOf(undefined, withMath ? math : null);
  const tree = markdownToHast(pipeline, withMath ? convertTexDelimiters(markdown) : markdown);
  const box = useRef<HTMLDivElement>(null);
  // セルを開く前の列の幅（開いている間はこの幅に固定する）
  const widths = useRef<number[] | null>(null);
  const editing = open !== null;
  useLayoutEffect(() => {
    view.requestMeasure();
    const table = box.current?.querySelector("table");
    if (!editing && table) widths.current = [...(table.rows[0]?.cells ?? [])].map((c) => c.getBoundingClientRect().width);
  });
  // セルを開いている間は列の幅を固定する（開いたセルの中身が抜けても列が動かない。1 文字ごとに大きな表の全部の行の幅を測り直さない）
  useLayoutEffect(() => {
    const table = box.current?.querySelector("table");
    const fixed = widths.current;
    if (!editing || !table || !fixed) return;
    const head = [...(table.rows[0]?.cells ?? [])];
    table.style.tableLayout = "fixed";
    table.style.width = `${fixed.reduce((a, b) => a + b, 0)}px`;
    head.forEach((c, i) => (c.style.width = `${fixed[i] ?? 0}px`));
    return () => {
      table.style.tableLayout = "";
      table.style.width = "";
      head.forEach((c) => (c.style.width = ""));
    };
  }, [editing]);
  if (!tree) return <pre className="note-table-plain">{markdown}</pre>;
  markCells(tree);
  const element = toJsxRuntime(tree, { Fragment, components: TABLE_COMPONENTS, ignoreInvalidStyle: true, jsx, jsxs, passKeys: true, passNode: true });
  // 表の端の「＋」（最後に行・列を足す。マウスを乗せると出る）。押してもカーソルは動かさない
  const add = (append: typeof appendRow) => () => {
    if (box.current) append(view, view.posAtDOM(box.current));
  };
  const keep = (e: { preventDefault: () => void }) => e.preventDefault();
  return (
    <NoteTableContext.Provider value={{ view, open, matches }}>
      {/* セルとボタンのほか（表の余白）を押しても、本体にピントを移さない */}
      <div className="note-table-frame" onMouseDown={(e) => !(e.target as HTMLElement).closest("td, th, button, a") && e.preventDefault()}>
        <div ref={box} className="markdown">
          {element}
        </div>
        <IconButton icon={Plus} className="note-table-add-column" label="列を足す" size="xs" onMouseDown={keep} onClick={add(appendColumn)} />
        <IconButton icon={Plus} className="note-table-add-row" label="行を足す" size="xs" onMouseDown={keep} onClick={add(appendRow)} />
      </div>
    </NoteTableContext.Provider>
  );
}

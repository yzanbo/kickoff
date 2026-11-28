import type { Element, Root } from "hast";
import { toJsxRuntime } from "hast-util-to-jsx-runtime";
import { useLayoutEffect } from "react";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import type { EditorView } from "@codemirror/view";
import type { Components } from "react-markdown";
import { convertTexDelimiters, mayContainMath } from "@shared/foundation/markdown/mathGuard";
import { markdownToHast, pipelineOf } from "@/foundation/ui/markdown/markdownProcessor";
import { COMPONENTS } from "@/foundation/ui/markdown/markdownComponents";
import { useMathPlugins } from "@/foundation/ui/markdown/math/useMathPlugins";

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
 * 描き終えたら編集の部品に高さを測り直させる（置き換えた所の高さが変わるため）
 */
export function NoteTable({ markdown, view, components = COMPONENTS }: { markdown: string; view: EditorView; components?: Components }) {
  const hasMath = mayContainMath(markdown);
  const math = useMathPlugins(hasMath);
  const withMath = hasMath && math !== null;
  const pipeline = pipelineOf(undefined, withMath ? math : null);
  const tree = markdownToHast(pipeline, withMath ? convertTexDelimiters(markdown) : markdown);
  useLayoutEffect(() => {
    view.requestMeasure();
  });
  if (!tree) return <pre className="note-table-plain">{markdown}</pre>;
  markCells(tree);
  const element = toJsxRuntime(tree, { Fragment, components, ignoreInvalidStyle: true, jsx, jsxs, passKeys: true, passNode: true });
  return <div className="markdown">{element}</div>;
}

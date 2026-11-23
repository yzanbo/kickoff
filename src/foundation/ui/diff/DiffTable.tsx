// 差分の表（git diff と同じ 1 列 / 左右に並べる）。コードのセルの data-no・data-side は外から読む取り決め（diffModel.ts の DIFF_ROW_ATTRS）
import "./DiffTable.css";
import { Fragment, type ReactNode } from "react";
import { cx } from "@/foundation/ui/lib/cx";
import type { CodeToken } from "@/foundation/ui/code/highlight";
import { CodeLine } from "@/foundation/ui/kit/CodeLine";
import { toSplitRows, type DiffLine } from "./diffModel";

/** これより狭いときは、左右に並べる設定でも 1 列で出す */
export const SPLIT_MIN_WIDTH = 560;

/** 行ごとの色（useDiffHighlight） */
export type TokensOf = Map<DiffLine, CodeToken[]>;

/** git diff と同じ 1 列（左に変更前・変更後の行番号）。after はその行の下に横幅いっぱいで足すもの（GitHub の PR の行のスレッド） */
export function UnifiedDiff({ lines, tokensOf, after }: { lines: DiffLine[]; tokensOf: TokensOf; after?: (line: DiffLine) => ReactNode }) {
  return (
    <table className="diff-table">
      <colgroup>
        <col className="diff-col-no" />
        <col className="diff-col-no" />
        <col />
      </colgroup>
      <tbody>
        {lines.map((line, i) =>
          line.type === "hunk" ? (
            <tr key={i} className="diff-hunk">
              <td colSpan={3}>{line.text}</td>
            </tr>
          ) : (
            <Fragment key={i}>
              <tr className={`line-${line.type}`}>
                <td className="diff-no">{line.oldNo}</td>
                <td className="diff-no">{line.newNo}</td>
                {/* 行の番号と変更前・変更後のどちらか（チャットの画面の右の欄で、選んだ行の「チャットに追加」に使う） */}
                <td className="diff-code" data-no={line.newNo ?? line.oldNo} data-side={line.newNo !== undefined ? "new" : "old"}>
                  <span className="diff-sign">{line.type === "add" ? "+" : line.type === "del" ? "-" : " "}</span>
                  <CodeLine tokens={tokensOf.get(line)} text={line.text} />
                </td>
              </tr>
              {after?.(line)}
            </Fragment>
          ),
        )}
      </tbody>
    </table>
  );
}

/** 左に変更前、右に変更後を並べる（VS Code と同じ） */
export function SplitDiff({ lines, tokensOf }: { lines: DiffLine[]; tokensOf: TokensOf }) {
  const rows = toSplitRows(lines);
  // 左右で key を分ける（同じ key だと、片側のセルが落ちる）
  const side = (line: DiffLine | undefined, no: "oldNo" | "newNo") => [
    <td key={`${no}-no`} className={cx("diff-no", line ? `line-${line.type}` : "line-empty")}>
      {line?.[no]}
    </td>,
    <td key={`${no}-code`} className={cx("diff-code", line ? `line-${line.type}` : "line-empty")} data-no={line?.[no]} data-side={no === "newNo" ? "new" : "old"}>
      {line && <CodeLine tokens={tokensOf.get(line)} text={line.text} />}
    </td>,
  ];
  return (
    <table className="diff-table">
      <colgroup>
        <col className="diff-col-no" />
        <col />
        <col className="diff-col-no" />
        <col />
      </colgroup>
      <tbody>
        {rows.map((row, i) =>
          "hunk" in row ? (
            <tr key={i} className="diff-hunk">
              <td colSpan={4}>{row.hunk.text}</td>
            </tr>
          ) : (
            <tr key={i}>
              {side(row.left, "oldNo")}
              {side(row.right, "newNo")}
            </tr>
          ),
        )}
      </tbody>
    </table>
  );
}

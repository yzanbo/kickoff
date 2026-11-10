import { useEffect, useMemo, useRef } from "react";
import { cx } from "@/lib/cx";
import { languageOf } from "@/lib/languages";
import { useHighlight } from "@/hooks/useHighlight";
import { CodeLine } from "@/ui/CodeLine";

/**
 * 読むだけのファイルの中身の表（大きすぎて途中までのファイル。FileView が編集の部品の代わりに出す）。
 * 開いた行（line）を真ん中に出す。wrap なら横幅に入らない行を折り返す（編集の部品と同じ設定 EDITOR_WORD_WRAP）
 */
export function ReadOnlyCode({ path, content, line, wrap }: { path: string; content: string; line?: number; wrap: boolean }) {
  const lines = useMemo(() => content.replace(/\n$/, "").split("\n"), [content]);
  const tokens = useHighlight(lines, languageOf(path));
  const focusRef = useRef<HTMLTableRowElement>(null);
  // 開いた行を真ん中に出す（中身を読み込んだあと・別の行を選んだとき）
  useEffect(() => {
    focusRef.current?.scrollIntoView({ block: "center" });
  }, [line, lines]);

  return (
    // data-quote-path・data-no: 右の欄・別ウィンドウで行を選んでチャットに足すとき（useCodeQuoteMenu・SideSelectionAttach）に読む
    <table className={cx("diff-table", !wrap && "no-wrap")} data-quote-path={path}>
      <colgroup>
        <col className="diff-col-no" />
        <col />
      </colgroup>
      <tbody>
        {lines.map((text, i) => (
          <tr key={i} ref={i + 1 === line ? focusRef : undefined} className={cx(i + 1 === line && "line-focus")}>
            <td className="diff-no">{i + 1}</td>
            <td className="diff-code" data-no={i + 1}>
              <CodeLine tokens={tokens?.[i]} text={text} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

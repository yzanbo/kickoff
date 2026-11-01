import { useEffect, useMemo, useRef, useState } from "react";
import type { FileContent } from "../../../../core/types";
import { api } from "../../api";
import { errorMessage } from "../../errors";
import { useHighlight } from "../../hooks/useHighlight";
import { cx } from "../../cx";
import { CodeLine } from "../CodeLine";
import { ErrorText } from "../ErrorText";

/**
 * ファイルの中身（読むだけ。行番号つき）。line を渡すと、その行までスクロールして目立たせる（検索の結果から開いたとき）。
 * changed: コミットしていない変更があるか（見出しに出す）
 */
export function FileView({ projectId, path, line, changed = false, version }: { projectId: number; path: string; line?: number; changed?: boolean; version: number }) {
  const key = `${projectId}:${path}`;
  const [state, setState] = useState<{ key: string; file?: FileContent; error?: string }>();

  useEffect(() => {
    let alive = true;
    api.projectFile(projectId, path).then(
      (file) => alive && setState({ key, file }),
      (e: unknown) => alive && setState({ key, error: errorMessage(e) }),
    );
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, version]);

  const current = state?.key === key ? state : undefined;
  const lines = useMemo(() => current?.file?.content.replace(/\n$/, "").split("\n") ?? [], [current?.file]);
  const tokens = useHighlight(lines, path);
  const focusRef = useRef<HTMLTableRowElement>(null);
  // 開いた行を真ん中に出す（中身を読み込んだあと・別の行を選んだとき）
  useEffect(() => {
    focusRef.current?.scrollIntoView({ block: "center" });
  }, [line, lines]);

  return (
    <div className="diff-view">
      <header className="diff-head">
        <span className="diff-path" title={path}>
          {path}
        </span>
        <span className="diff-state">
          {line !== undefined && `${line} 行目・`}
          {changed ? "変更あり" : "変更なし"}
        </span>
      </header>
      <div className="diff-body">
        {!current ? (
          <p className="muted small diff-message">読み込み中…</p>
        ) : current.error ? (
          <ErrorText message={current.error} className="diff-message" />
        ) : current.file?.binary ? (
          <p className="muted small diff-message">バイナリのファイルなので、中身は表示できません。</p>
        ) : (
          <table className="diff-table">
            <colgroup>
              <col className="diff-col-no" />
              <col />
            </colgroup>
            <tbody>
              {lines.map((text, i) => (
                <tr key={i} ref={i + 1 === line ? focusRef : undefined} className={cx(i + 1 === line && "line-focus")}>
                  <td className="diff-no">{i + 1}</td>
                  <td className="diff-code">
                    <CodeLine tokens={tokens?.[i]} text={text} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {current?.file?.truncated && <p className="muted small diff-message">大きいため、途中までを表示しています。</p>}
      </div>
    </div>
  );
}

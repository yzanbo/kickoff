import { useEffect, useMemo, useState } from "react";
import type { FileContent } from "../../../../core/types";
import { api } from "../../api";
import { errorMessage } from "../../errors";
import { ErrorText } from "../ErrorText";

/** 変更のないファイルの中身（読むだけ。行番号つき） */
export function FileView({ projectId, path, version }: { projectId: number; path: string; version: number }) {
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

  return (
    <div className="diff-view">
      <header className="diff-head">
        <span className="diff-path" title={path}>
          {path}
        </span>
        <span className="diff-state">変更なし</span>
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
              {lines.map((line, i) => (
                <tr key={i}>
                  <td className="diff-no">{i + 1}</td>
                  <td className="diff-code">{line}</td>
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

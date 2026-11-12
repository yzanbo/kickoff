import { memo, useCallback, useMemo, useState } from "react";
import { MessageSquare } from "lucide-react";
import type { GitHubPullFile, GitHubReviewThread } from "@shared/types";
import { api } from "@/api";
import { useKeyedAsync } from "@/hooks/useKeyedAsync";
import { Chevron } from "@/ui/Chevron";
import { ErrorText } from "@/ui/ErrorText";
import { FileIcon } from "@/features/editor/FileIcon";
import { UnifiedDiff, useDiffHighlight } from "@/features/editor/DiffView";
import { parseDiff } from "@/features/editor/parseDiff";
import { GitHubThread } from "./GitHubTimeline";
import { placeThreads, threadsAt } from "./pullThreads";

/** これより多いファイルの PR は、初めはすべて畳んでおく（開いた分だけ差分を描く） */
const OPEN_ALL_MAX = 20;

/** ファイルの変わり方の名前（GitHub の status） */
const FILE_STATUS_LABELS: Record<string, string> = {
  added: "追加",
  removed: "削除",
  modified: "変更",
  renamed: "名前の変更",
  copied: "コピー",
  changed: "変更",
  unchanged: "変更なし",
};

/** 1 つのファイルの見出しと差分（差分の行の下にその行のスレッド、行の見つからないスレッドはファイルの下） */
const PullFile = memo(function PullFile({ file, threads, open, onToggle }: { file: GitHubPullFile; threads: GitHubReviewThread[]; open: boolean; onToggle: (path: string) => void }) {
  const lines = useMemo(() => (open && file.patch ? parseDiff(file.patch) : []), [open, file.patch]);
  const placed = useMemo(() => placeThreads(threads, file.path, lines), [threads, file.path, lines]);
  const tokensOf = useDiffHighlight(lines, file.path, file.previous_path);
  const count = threads.filter((t) => t.path === file.path).length;
  const name = file.path.split("/").pop() ?? file.path;

  return (
    <section className="github-file">
      <button type="button" className="github-file-head" aria-expanded={open} onClick={() => onToggle(file.path)}>
        <Chevron open={open} />
        <FileIcon name={name} />
        <span className="github-file-path" data-tip={file.path}>
          {file.previous_path && <span className="muted">{file.previous_path} → </span>}
          {file.path}
        </span>
        <span className="github-file-status muted small">{FILE_STATUS_LABELS[file.status] ?? file.status}</span>
        {count > 0 && (
          <span className="github-file-threads muted small" aria-label={`行のスレッド ${count} 件`}>
            <MessageSquare size={12} aria-hidden />
            {count}
          </span>
        )}
        <span className="github-diffstat small">
          <span className="github-add">+{file.additions}</span> <span className="github-del">−{file.deletions}</span>
        </span>
      </button>
      {open && (
        <div className="diff-view github-file-diff">
          <div className="diff-body">
            {file.patch === null ? (
              <p className="muted small diff-message">大きすぎるか、バイナリのファイルなので、差分は GitHub で見てください。</p>
            ) : lines.length === 0 ? (
              <p className="muted small diff-message">中身の変更はありません（名前や権限だけの変更です）。</p>
            ) : (
              <UnifiedDiff
                lines={lines}
                tokensOf={tokensOf}
                after={(line) => {
                  const own = threadsAt(placed, line);
                  return own.length === 0 ? null : (
                    <tr className="github-diff-threads">
                      <td colSpan={3}>
                        {own.map((t) => (
                          <GitHubThread key={t.id} thread={t} inline />
                        ))}
                      </td>
                    </tr>
                  );
                }}
              />
            )}
          </div>
          {placed.rest.length > 0 && (
            <div className="github-file-rest">
              <p className="muted small">いまの差分にない行へのスレッド</p>
              {placed.rest.map((t) => (
                <GitHubThread key={t.id} thread={t} />
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
});

/**
 * PR の「変更」（変えたファイルごとの差分と、行のスレッド）。差分は 1 列で、スレッドはその行の下に出す（GitHub と同じ）。
 * version（PR の最新のコミット）が変わったら取り直す。ファイルが多ければ初めは畳んでおく
 */
export function GitHubPullChanges({ projectId, number, threads, version }: { projectId: number; number: number; threads: GitHubReviewThread[]; version: string }) {
  const loaded = useKeyedAsync(`${projectId}:${number}`, () => api.githubPullFiles(projectId, number), { deps: [version] });
  // 開閉は「既定から変えたファイル」だけ覚える（既定はファイルの数で決まる）
  const [toggled, setToggled] = useState<ReadonlySet<string>>(new Set());
  const toggle = useCallback(
    (path: string) =>
      setToggled((prev) => {
        const next = new Set(prev);
        if (!next.delete(path)) next.add(path);
        return next;
      }),
    [],
  );

  if (loaded.error) return <ErrorText message={loaded.error} />;
  const data = loaded.data;
  if (!data) return <p className="muted small github-detail-loading">読み込み中…</p>;
  if (data.files.length === 0) return <p className="muted small">この PR には変更したファイルがありません。</p>;
  const openByDefault = data.files.length <= OPEN_ALL_MAX;

  return (
    <div className="github-files">
      {!openByDefault && <p className="muted small">ファイルが多いので畳んでいます。見出しを押すと差分を開きます。</p>}
      {data.files.map((f) => (
        <PullFile key={f.path} file={f} threads={threads} open={openByDefault !== toggled.has(f.path)} onToggle={toggle} />
      ))}
      {data.truncated && <p className="muted small">ファイルが多いので、初めの {data.files.length.toLocaleString()} 件までを出しています。続きは GitHub で見てください。</p>}
    </div>
  );
}

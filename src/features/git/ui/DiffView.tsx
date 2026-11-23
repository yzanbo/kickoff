import { Pencil } from "lucide-react";
import type { GitDiff, GitFileChange } from "@shared/git/types";
import { GIT_CHANGE_LABELS } from "@shared/git/labels";
import { errorText, useQuery } from "@/foundation/ui/query";
import { useNarrowerThan } from "@/foundation/ui/hooks/useNarrowerThan";
import { ErrorText } from "@/foundation/ui/kit/ErrorText";
import { DiffLayoutToggle, useDiffLayout } from "@/foundation/ui/diff/DiffLayoutToggle";
import { parseDiff } from "@/foundation/ui/diff/diffModel";
import { SPLIT_MIN_WIDTH, SplitDiff, UnifiedDiff } from "@/foundation/ui/diff/DiffTable";
import { useDiffHighlight } from "@/foundation/ui/diff/useDiffHighlight";
import { useWorkplace } from "@/foundation/ui/workplace/workplaceContext";
import { workplaceKey } from "@/foundation/ui/workplace/workplace";
import { gitApi } from "./api";
import { workdirInput } from "@/foundation/ui/api/workdir";

/** files の FileTree が読む変更の種類の名前（files ⇄ git の口 filesGit を作る P8-1g で消す） */
export { GIT_CHANGE_LABELS as CHANGE_LABELS } from "@shared/git/labels";

/** 読み込んだ差分（まだ読み込んでいなければ undefined） */
export type LoadedDiff = { diff: GitDiff | undefined; error: string | undefined } | undefined;

/**
 * 1 つのファイルの差分を読む（作業場所は WorkplaceProvider。version が変わったら取り直し、取り直している間は前の差分を出しておく。
 * 同じファイルのとき・ちらつかないように）。active: false なら読まない
 */
export function useFileDiff({ projectId, file, staged, version, commit, active = true }: { projectId: number; file: GitFileChange; staged: boolean; version: number; commit?: string; active?: boolean }): LoadedDiff {
  const target = useWorkplace(projectId);
  const at = workplaceKey(target);
  const key = `${at}:${commit ?? (staged ? "staged" : "unstaged")}:${file.path}:${file.old_path ?? ""}`;
  const loaded = useQuery(key, () => (commit
        ? gitApi("GET /api/projects/:projectId/git/commits/:hash/diff", { params: { ...workdirInput(target).params, hash: commit }, query: workdirInput(target, { path: file.path, old: file.old_path }).query })
        : gitApi("GET /api/projects/:projectId/git/diff", workdirInput(target, { path: file.path, old: file.old_path, staged }))), { deps: [version], enabled: active });
  return loaded.loaded ? { diff: loaded.data, error: errorText(loaded.error) } : undefined;
}

/**
 * 選んだファイルの差分。VS Code と同じく左右に並べて出し、git diff と同じ 1 列にもできる（選んだ方を覚えておく）。
 * version が変わったら（変更の一覧を取り直したら）、差分も取り直す
 */
export function DiffView({
  projectId,
  file,
  staged,
  version,
  onEdit,
  commit,
  bare = false,
  source,
}: {
  projectId: number;
  file: GitFileChange;
  staged: boolean;
  version: number;
  /** いまのファイルを編集する（消したファイルでは渡さない） */
  onEdit?: () => void;
  /** コミットでの差分を出すとき（履歴から開いたとき）。staged は使わない */
  commit?: string;
  /** 見出し（パス・状態・編集・表示のしかた）を出さない（右の欄の「変更」のように、見出しを外で並べるとき） */
  bare?: boolean;
  /** 読み込み済みの差分（useFileDiff。外で読んでいるときは、ここでは読まない） */
  source?: LoadedDiff;
}) {
  const layout = useDiffLayout();
  // 左右に並べる設定でも、2 つ並べると読めない狭い欄（チャットの画面の右の欄など）では 1 列で出す（設定は変えない）
  const { ref, narrow } = useNarrowerThan<HTMLDivElement>(SPLIT_MIN_WIDTH);
  const shown = layout === "split" && narrow ? "unified" : layout;
  const own = useFileDiff({ projectId, file, staged, version, commit, active: source === undefined });
  const current = source ?? own;
  const diff = current?.diff;
  const lines = diff ? parseDiff(diff.diff) : [];
  const tokensOf = useDiffHighlight(lines, file.path, file.old_path);

  return (
    <div ref={ref} className="diff-view">
      {!bare && (
      <header className="diff-head bar">
        <span className="diff-path" title={file.path}>
          {file.old_path && <span className="muted">{file.old_path} → </span>}
          {file.path}
        </span>
        <span className="diff-state">
          {GIT_CHANGE_LABELS[file.kind]}・{commit ? commit.slice(0, 7) : staged ? "ステージ済み" : "未ステージ"}
        </span>
        <span className="spacer" />
        {onEdit && (
          <button className="btn" data-size="sm" title="いまのファイルを編集する" onClick={onEdit}>
            <Pencil size={13} aria-hidden /> 編集
          </button>
        )}
        <DiffLayoutToggle />
      </header>
      )}
      <div className="diff-body">
        {!current ? (
          <p className="muted small diff-message">読み込み中…</p>
        ) : current.error ? (
          <ErrorText message={current.error} className="diff-message" />
        ) : current.diff?.binary ? (
          <p className="muted small diff-message">バイナリのファイルなので、差分は表示できません。</p>
        ) : lines.length === 0 ? (
          <p className="muted small diff-message">中身の変更はありません（名前や権限だけの変更です）。</p>
        ) : shown === "split" ? (
          <SplitDiff lines={lines} tokensOf={tokensOf} />
        ) : (
          <UnifiedDiff lines={lines} tokensOf={tokensOf} />
        )}
        {current?.diff?.truncated && <p className="muted small diff-message">大きいため、途中までを表示しています。</p>}
      </div>
    </div>
  );
}

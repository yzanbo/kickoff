import { Bot, File, Folder, FolderGit2, History, MessageSquare, RotateCcw, Trash2, User } from "lucide-react";
import type { TrashItem } from "@shared/types";
import { formatSize } from "@shared/attachment/truncate";
import { useProjectTrash } from "@/stores/trash";
import { useProjects } from "@/stores/projects";
import { openChat } from "@/app/router";
import { EmptyState } from "@/ui/EmptyState";
import { ErrorText } from "@/ui/ErrorText";
import { useTicker } from "@/hooks/useTicker";
import { formatDayTime } from "@/lib/time";
import { useAction } from "@/hooks/useAction";
import { restoreFromTrash } from "./trashActions";
import { remainingText } from "./trashText";

/** 元の場所の見せ方（プロジェクトフォルダの中なら、そこからの場所） */
function originText(origin: string | null, repoPath: string | undefined): string | null {
  if (!origin) return null;
  if (repoPath && origin.startsWith(`${repoPath}/`)) return origin.slice(repoPath.length + 1);
  return origin;
}

const kindIcon = (item: TrashItem) => (item.kind === "chat" ? MessageSquare : item.kind === "project" ? FolderGit2 : item.kind === "session" ? History : item.is_dir ? Folder : File);

/**
 * プロジェクトの「ゴミ箱」タブ（メモの仕様書「ファイル削除」の Q6・Q10）。Kickoff のゴミ箱に入れたもの（AI の kickoff-trash・ファイル / メモの「ゴミ箱に入れる」・
 * チャットの削除）を新しい順に並べ、何を・いつ・誰が消したか・消えるまでの残り・大きさと「元に戻す」を出す。本当に消す操作は置かない（3 日で消える）
 */
export function TrashTab({ projectId }: { projectId: number }) {
  const { data, error, loaded } = useProjectTrash(projectId);
  const { projectsById } = useProjects();
  const repoPath = projectsById.get(projectId)?.repo_path;
  // 残りの時間を描き直す
  useTicker(60_000);
  const items = data ?? [];
  return (
    <div className="trash-tab">
      <header className="trash-head">
        <Trash2 size={16} aria-hidden />
        <h2>ゴミ箱</h2>
        <span className="muted small">消したものを 3 日取っておきます。3 日たつと本当に消えます（OS のゴミ箱とは別です）。</span>
      </header>
      <ErrorText message={error} />
      {loaded && items.length === 0 ? (
        <EmptyState icon={Trash2} title="ゴミ箱は空です">
          AI が消したファイル（rm の代わりの kickoff-trash）・ファイルタブやメモの「ゴミ箱に入れる」・削除したチャットが、ここに 3 日入ります。
        </EmptyState>
      ) : (
        <ul className="trash-list">
          {items.map((item) => (
            <TrashRow key={item.id} item={item} projectId={projectId} repoPath={repoPath} />
          ))}
        </ul>
      )}
    </div>
  );
}

function TrashRow({ item, projectId, repoPath }: { item: TrashItem; projectId: number; repoPath: string | undefined }) {
  const { busy, run } = useAction();
  const Icon = kindIcon(item);
  const where = originText(item.origin, repoPath);
  return (
    <li className="trash-row">
      <Icon size={16} className="trash-row-icon" aria-hidden />
      <div className="trash-row-main">
        <div className="trash-row-title">
          <span className="trash-row-name">{item.label}</span>
          {where && (
            <span className="trash-row-path muted" title={item.origin ?? undefined}>
              {where}
            </span>
          )}
        </div>
        <div className="trash-row-meta muted small">
          {item.by_chat_id !== null ? (
            <button type="button" className="link-button hover-bg trash-row-by" onClick={() => openChat(projectId, item.by_chat_id!)} title="消したチャットを開く">
              <Bot size={12} aria-hidden />
              {item.by_chat_title ?? "チャット"} の AI
            </button>
          ) : (
            <span className="trash-row-by">
              <User size={12} aria-hidden />
              あなた
            </span>
          )}
          <span title={new Date(item.trashed_at).toLocaleString()}>{formatDayTime(item.trashed_at)}</span>
          {item.size !== null && <span>{formatSize(item.size)}</span>}
          <span className="trash-row-remaining" title={`${new Date(item.expires_at).toLocaleString()} に消えます`}>
            {remainingText(item.expires_at)}
          </span>
        </div>
      </div>
      <button type="button" className="btn btn-sm" disabled={busy !== null} onClick={() => void run("restore", () => restoreFromTrash(item))}>
        <RotateCcw size={14} aria-hidden />
        元に戻す
      </button>
    </li>
  );
}

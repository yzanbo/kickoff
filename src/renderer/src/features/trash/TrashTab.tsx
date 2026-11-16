import { Bot, File, Folder, FolderGit2, GitBranch, History, MessageSquare, RotateCcw, Trash2, User } from "lucide-react";
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
import { emptyTrash, purgeFromTrash, restoreFromTrash } from "./trashActions";
import { remainingText } from "./trashText";

/** 元の場所の見せ方（プロジェクトフォルダの中なら、そこからの場所） */
function originText(origin: string | null, repoPath: string | undefined): string | null {
  if (!origin) return null;
  if (repoPath && origin.startsWith(`${repoPath}/`)) return origin.slice(repoPath.length + 1);
  return origin;
}

const KIND_ICONS = { chat: MessageSquare, project: FolderGit2, session: History, worktree: GitBranch } as const;
const kindIcon = (item: TrashItem) => (item.kind === "file" ? (item.is_dir ? Folder : File) : KIND_ICONS[item.kind]);

/**
 * プロジェクトの「ゴミ箱」タブ（メモの仕様書「ファイル削除」の Q6・Q10）。Kickoff のゴミ箱に入れたもの（AI の kickoff-trash・ファイル / メモの「ゴミ箱に入れる」・
 * チャットの削除）を新しい順に並べ、何を・いつ・誰が消したか・消えるまでの残り・大きさと「元に戻す」「完全に消す」を出す。3 日を待たずに全部を消す
 * 「ゴミ箱を空にする」も見出しに置く（利用者の依頼。前は 3 日で消えるのを待つだけだった）
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
        <span className="muted small">消したものを 3 日取っておきます。3 日たつと本当に消えます（待たずに完全に消すこともできます。OS のゴミ箱とは別です）。</span>
        <span className="spacer" />
        <EmptyTrashButton items={items} label="ゴミ箱を空にする" title={`ゴミ箱の ${items.length} 件を完全に消しますか？`} />
      </header>
      <ErrorText message={error} />
      {loaded && items.length === 0 ? (
        <EmptyState icon={Trash2} title="ゴミ箱は空です">
          AI が消したファイル（rm の代わりの kickoff-trash）・ファイルタブやメモの「ゴミ箱に入れる」・削除したチャット・消したワークツリーの控え（取り込んでいないコミット・途中の変更）が、ここに 3 日入ります。
        </EmptyState>
      ) : (
        <ul className="trash-list">
          {items.map((item) => (
            <TrashRow key={item.id} item={item} repoPath={repoPath} />
          ))}
        </ul>
      )}
    </div>
  );
}

/** ゴミ箱の 1 行（プロジェクトの「ゴミ箱」タブと、設定の「ゴミ箱と整理」のプロジェクトのないもの） */
export function TrashRow({ item, repoPath }: { item: TrashItem; repoPath?: string }) {
  const Icon = kindIcon(item);
  // 元の場所（名前だけと同じ = プロジェクトフォルダのいちばん上なら出さない）
  const shown = originText(item.origin, repoPath);
  const where = shown === item.label ? null : shown;
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
          {item.by_chat_id !== null && item.project_id !== null ? (
            <button type="button" className="link-button hover-bg trash-row-by" onClick={() => openChat(item.project_id!, item.by_chat_id!)} title="消したチャットを開く">
              <Bot size={12} aria-hidden />
              {item.by_chat_title ?? "チャット"} の AI
            </button>
          ) : item.kind === "session" ? (
            <span className="trash-row-by" title="長いチャットを直近の区切りだけの会話記録に乗り換えたので、古い会話記録を Kickoff が入れました">
              <History size={12} aria-hidden />
              Kickoff の片付け
            </span>
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
      <TrashRowActions item={item} />
    </li>
  );
}

/** ゴミ箱の行の右の操作（「元に戻す」と、3 日を待たずに「完全に消す」。行の直下に並べる） */
export function TrashRowActions({ item }: { item: TrashItem }) {
  const { busy, run } = useAction();
  return (
    <>
      <button type="button" className="btn btn-sm" disabled={busy !== null} onClick={() => void run("restore", () => restoreFromTrash(item))}>
        <RotateCcw size={14} aria-hidden />
        元に戻す
      </button>
      <button type="button" className="btn btn-sm" disabled={busy !== null} onClick={() => void run("purge", () => purgeFromTrash(item))}>
        <Trash2 size={14} aria-hidden />
        完全に消す
      </button>
    </>
  );
}

/** 並んでいるものをまとめて完全に消すボタン（タブの「ゴミ箱を空にする」・設定の「すべて完全に消す」。何もなければ出さない） */
export function EmptyTrashButton({ items, label, title }: { items: readonly TrashItem[]; label: string; title: string }) {
  const { busy, run } = useAction();
  if (items.length === 0) return null;
  return (
    <button type="button" className="btn btn-danger btn-sm trash-empty" disabled={busy !== null} onClick={() => void run("empty", () => emptyTrash(items, title))}>
      <Trash2 size={14} aria-hidden />
      {label}
    </button>
  );
}

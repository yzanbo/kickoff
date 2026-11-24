// ゴミ箱の 1 行と操作（プロジェクトの「ゴミ箱」タブ・設定の「ゴミ箱と整理」のプロジェクトとプロジェクトのないもの）。種類ごとの違いは trashKinds の登録から
import "./TrashRow.css";
import { Bot, File, RotateCcw, Trash2, User } from "lucide-react";
import type { TrashItem } from "@shared/trash/types";
import { formatBytes } from "@shared/foundation/text/bytes";
import { open } from "@/foundation/ui/navigation/open";
import { formatDayTime } from "@/foundation/ui/lib/time";
import { useAction } from "@/foundation/ui/hooks/useAction";
import { trashKindView, type TrashKindView } from "./points";
import { emptyTrash, purgeFromTrash, restoreFromTrash } from "./trashActions";
import { remainingText } from "./trashText";

/** 元の場所の見せ方（プロジェクトフォルダの中なら、そこからの場所） */
function originText(origin: string | null, repoPath: string | undefined): string | null {
  if (!origin) return null;
  if (repoPath && origin.startsWith(`${repoPath}/`)) return origin.slice(repoPath.length + 1);
  return origin;
}

/** 誰が消したか（チャットの AI が消したものはそのチャットを開くボタン。ほかは種類の登録、なければ「あなた」） */
function TrashBy({ item, By }: { item: TrashItem; By: TrashKindView["By"] }) {
  const { by_chat_id: chatId, project_id: projectId } = item;
  if (chatId !== null && projectId !== null) {
    return (
      <button type="button" className="link-button hover-bg trash-row-by" onClick={() => open({ kind: "chat", projectId, chatId })} title="消したチャットを開く">
        <Bot size={12} aria-hidden />
        {item.by_chat_title ?? "チャット"} の AI
      </button>
    );
  }
  if (By === null) return null;
  if (By) return <By item={item} />;
  return (
    <span className="trash-row-by">
      <User size={12} aria-hidden />
      あなた
    </span>
  );
}

/** ゴミ箱の 1 行（repoPath はプロジェクトのフォルダ = 元の場所をそこからの場所で出す） */
export function TrashRow({ item, repoPath }: { item: TrashItem; repoPath?: string }) {
  const view = trashKindView(item.kind);
  const Icon = view?.icon(item) ?? File;
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
          <TrashBy item={item} By={view?.By} />
          <span title={new Date(item.trashed_at).toLocaleString()}>
            {formatDayTime(item.trashed_at)}
            {view?.trashedSuffix}
          </span>
          {item.size !== null && <span>{formatBytes(item.size)}</span>}
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
function TrashRowActions({ item }: { item: TrashItem }) {
  const { busy, run } = useAction();
  return (
    <>
      <button type="button" className="btn" data-size="sm" disabled={busy !== null} onClick={() => void run("restore", () => restoreFromTrash(item))}>
        <RotateCcw size={14} aria-hidden />
        元に戻す
      </button>
      <button type="button" className="btn" data-size="sm" disabled={busy !== null} onClick={() => void run("purge", () => purgeFromTrash(item))}>
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
    <button type="button" className="btn btn-danger trash-empty" data-size="sm" disabled={busy !== null} onClick={() => void run("empty", () => emptyTrash(items, title))}>
      <Trash2 size={14} aria-hidden />
      {label}
    </button>
  );
}

import { MessageSquare, SquarePen } from "lucide-react";
import { cx } from "../../cx";
import { RunPage } from "../../pages/RunPage";
import { IconButton } from "../IconButton";
import { NewChatPane } from "../NewChatPane";
import type { ProjectChatController } from "./useProjectChat";

/**
 * プロジェクトのチャット欄（画面の右端）。チャットを 1 つ表示し、上の「新しいチャット」で書き直す。
 * 閉じても要素は残し（hidden）、書きかけの文章をなくさない
 */
export function ProjectChat({ chat }: { chat: ProjectChatController }) {
  const { width } = chat;
  return (
    <aside
      ref={width.paneRef}
      className={cx("project-chat", width.resizing && "resizing")}
      style={{ width: width.width }}
      hidden={!chat.open}
      aria-label="プロジェクトのチャット"
    >
      <div className="pane-resizer project-chat-resizer" aria-label="チャット欄の幅を変える" {...width.handle} />
      <div className="project-chat-bar">
        <MessageSquare size={13} aria-hidden />
        <span className="project-chat-title">チャット</span>
        <span className="spacer" />
        <IconButton icon={SquarePen} size={14} label="新しいチャット" disabled={chat.runId === null} onClick={chat.startNew} />
      </div>
      <div className="project-chat-body">
        {chat.runId === null ? (
          <NewChatPane key={`new:${chat.projectId}`} projectId={chat.projectId} onClose={chat.close} onCreated={(run) => chat.showRun(run.id)} />
        ) : (
          <RunPage key={chat.runId} projectId={chat.projectId} runId={chat.runId} visible={chat.open} onClose={chat.close} />
        )}
      </div>
    </aside>
  );
}

/** チャット欄の開閉ボタン（プロジェクトのタブの列の右端） */
export function ProjectChatToggle({ chat }: { chat: ProjectChatController }) {
  return (
    <button
      className={cx("btn btn-sm project-chat-toggle", chat.open && "active")}
      title={chat.open ? "チャット欄を閉じる（⌥⌘B）" : "チャット欄を開く（⌥⌘B）"}
      aria-pressed={chat.open}
      onClick={chat.toggle}
    >
      <MessageSquare size={13} aria-hidden /> <span className="btn-label">チャット</span>
    </button>
  );
}

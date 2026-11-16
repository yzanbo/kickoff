import type { CSSProperties } from "react";
import { cx } from "@/lib/cx";
import { Panel } from "@/features/panel/Panel";
import { usePanel, type TerminalTarget } from "@/features/panel/usePanel";
import type { ProjectChatController } from "./useProjectChat";

/** 右サイドバーはブラウザだけなので、ターミナルを開く場所はない */
const NO_TERMINALS: TerminalTarget[] = [];

/**
 * プロジェクトのチャット欄（画面の右端。下のパネルより下まで）。中身はボードの右のパネルと同じタブ（Panel）で、
 * ＋からチャット・ブラウザ・ターミナルを開ける。左端のつまみで幅を変える。閉じても要素は残し（幅 0）、書きかけの文章をなくさない
 */
export function ProjectChat({ chat }: { chat: ProjectChatController }) {
  const { width: { paneRef: widthPaneRef, ...width }, projectId, noChat } = chat;
  if (projectId === undefined) return null;
  return (
    <aside
      ref={widthPaneRef}
      className={cx("project-chat", chat.open && "open", width.resizing && "resizing")}
      // 開閉は幅の動きで見せる（中身は開いたときの幅のまま。動いている間に中身の並びが崩れないように）
      style={{ "--chat-w": `${width.size}px` } as CSSProperties}
      inert={!chat.open}
      aria-hidden={!chat.open}
      aria-label="右サイドバー"
    >
      <div className="pane-resizer project-chat-resizer" aria-label="右サイドバーの幅を変える" {...width.handle} />
      <div className="project-chat-inner">
        {/* 上の行は信号機ボタン・右上のレイアウトの開閉と同じ行のウィンドウのドラッグ領域。タブの列はその下の行（利用者の依頼） */}
        <div className="project-chat-titlebar" aria-hidden />
        <ProjectChatPanel projectId={projectId} noChat={noChat} />
      </div>
    </aside>
  );
}

/**
 * チャット欄の中身（プロジェクトのタブ。開いているかは欄の殻 useProjectChat と同じ店から読む）。チャット欄の別ウィンドウ（PopoutSideChat）も同じものを描く。
 * 欄ごと別ウィンドウへ移すボタンは置かない（利用者の依頼で隠した。タブは右クリック・ウィンドウの外へのドラッグで 1 つずつ別ウィンドウで開ける）
 */
export function ProjectChatPanel({ projectId, noChat }: { projectId: number; noChat: boolean }) {
  // ブラウザだけの欄（利用者の依頼）なので、新しいチャット・ターミナルの開く場所は渡さない
  const panel = usePanel({ surface: "side", scope: projectId, noChat, newChat: undefined, terminals: NO_TERMINALS });
  return <Panel panel={panel} />;
}

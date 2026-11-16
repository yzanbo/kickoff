import { useMemo, type CSSProperties } from "react";
import { canPopout } from "@/app/popout";
import { cx } from "@/lib/cx";
import { useProjects } from "@/stores/projects";
import { Panel } from "@/features/panel/Panel";
import { terminalTargets, usePanel } from "@/features/panel/usePanel";
import type { PanelFrame } from "@/features/panel/PanelTools";
import { openSideWindow, type ProjectChatController } from "./useProjectChat";

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
      aria-label="プロジェクトのチャット"
    >
      <div className="pane-resizer project-chat-resizer" aria-label="チャット欄の幅を変える" {...width.handle} />
      <div className="project-chat-inner">
        <ProjectChatPanel projectId={projectId} noChat={noChat} popOut={canPopout() ? openSideWindow : undefined} />
      </div>
    </aside>
  );
}

/**
 * チャット欄の中身（プロジェクトのタブ。開いているかは欄の殻 useProjectChat と同じ店から読む）。チャット欄の別ウィンドウ（PopoutSideChat）も同じものを描く。
 * popOut: 欄ごと別ウィンドウへ移すボタン（タブの列の道具。メインのウィンドウだけ）
 */
export function ProjectChatPanel({ projectId, noChat, popOut }: { projectId: number; noChat: boolean; popOut?: () => void }) {
  const { projects } = useProjects();
  const panel = usePanel({ surface: "side", scope: projectId, noChat, newChat: noChat ? undefined : { projectId }, terminals: terminalTargets(projects, projectId) });
  const frame = useMemo<PanelFrame | undefined>(() => (popOut ? { popOut } : undefined), [popOut]);
  return <Panel panel={panel} frame={frame} />;
}

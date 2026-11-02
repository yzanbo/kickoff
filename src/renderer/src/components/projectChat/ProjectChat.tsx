import type { CSSProperties } from "react";
import { cx } from "../../cx";
import { useProjects } from "../../projectsContext";
import { SidePanel } from "../sidePanel/SidePanel";
import { terminalTargets } from "../sidePanel/useSidePanel";
import type { ProjectChatController } from "./useProjectChat";

/**
 * プロジェクトのチャット欄（画面の右端。下のパネルより下まで）。中身はボードの右のパネルと同じタブ（SidePanel）で、
 * ＋からチャット・ブラウザ・ターミナルを開ける。左端のつまみで幅を変える。閉じても要素は残し（幅 0）、書きかけの文章をなくさない
 */
export function ProjectChat({ chat }: { chat: ProjectChatController }) {
  const { width, projectId, panel } = chat;
  const { projects } = useProjects();
  if (projectId === undefined) return null;
  return (
    <aside
      ref={width.paneRef}
      className={cx("project-chat", chat.open && "open", width.resizing && "resizing")}
      // 開閉は幅の動きで見せる（中身は開いたときの幅のまま。動いている間に中身の並びが崩れないように）
      style={{ "--chat-w": `${width.width}px` } as CSSProperties}
      inert={!chat.open}
      aria-hidden={!chat.open}
      aria-label="プロジェクトのチャット"
    >
      <div className="pane-resizer project-chat-resizer" aria-label="チャット欄の幅を変える" {...width.handle} />
      <div className="project-chat-inner">
        <SidePanel
          panel={panel}
          onNewChat={() => panel.openNew({ projectId })}
          terminals={terminalTargets(projects, projectId)}
          sidebar={{ open: chat.open, onClose: chat.close }}
        />
      </div>
    </aside>
  );
}

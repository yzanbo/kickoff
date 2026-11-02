import type { ProjectSummary } from "../../../../core/types";
import { cx } from "../../cx";
import { SidePanel } from "../sidePanel/SidePanel";
import { terminalTargets } from "../sidePanel/useSidePanel";
import type { ProjectChatController } from "./useProjectChat";

/**
 * プロジェクトのチャット欄（画面の右端。下のパネルより下まで）。中身はボードの右のパネルと同じタブ（SidePanel）で、
 * ＋からチャット・ブラウザ・ターミナルを開ける。左端のつまみで幅を変える。閉じても要素は残し（hidden）、書きかけの文章をなくさない
 */
export function ProjectChat({ chat, projects }: { chat: ProjectChatController; projects: ProjectSummary[] }) {
  const { width, projectId, panel } = chat;
  if (projectId === undefined) return null;
  return (
    <aside
      ref={width.paneRef}
      className={cx("project-chat", width.resizing && "resizing")}
      style={{ width: width.width }}
      hidden={!chat.open}
      aria-label="プロジェクトのチャット"
    >
      <div className="pane-resizer project-chat-resizer" aria-label="チャット欄の幅を変える" {...width.handle} />
      <SidePanel
        panel={panel}
        onNewChat={() => panel.openNew({ projectId })}
        terminals={terminalTargets(projects, projectId)}
        sidebar={{ open: chat.open, onClose: chat.close }}
      />
    </aside>
  );
}

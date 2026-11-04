import type { CSSProperties } from "react";
import { cx } from "@/lib/cx";
import { useProjects } from "@/stores/projects";
import { Panel } from "@/features/panel/Panel";
import { terminalTargets, usePanel } from "@/features/panel/usePanel";
import type { ProjectChatController } from "./useProjectChat";

/**
 * プロジェクトのチャット欄（画面の右端。下のパネルより下まで）。中身はボードの右のパネルと同じタブ（Panel）で、
 * ＋からチャット・ブラウザ・ターミナルを開ける。左端のつまみで幅を変える。閉じても要素は残し（幅 0）、書きかけの文章をなくさない
 */
export function ProjectChat({ chat }: { chat: ProjectChatController }) {
  const { width, projectId } = chat;
  if (projectId === undefined) return null;
  return (
    <aside
      ref={width.paneRef}
      className={cx("project-chat", chat.open && "open", width.resizing && "resizing")}
      // 開閉は幅の動きで見せる（中身は開いたときの幅のまま。動いている間に中身の並びが崩れないように）
      style={{ "--chat-w": `${width.size}px` } as CSSProperties}
      inert={!chat.open}
      aria-hidden={!chat.open}
      aria-label="プロジェクトのチャット"
    >
      <div className="pane-resizer project-chat-resizer" aria-label="チャット欄の幅を変える" {...width.handle} />
      <div className="project-chat-inner">
        <ProjectChatPanel projectId={projectId} />
      </div>
    </aside>
  );
}

/** チャット欄の中身（プロジェクトのタブ。開いているかは欄の殻 useProjectChat と同じ店から読む） */
function ProjectChatPanel({ projectId }: { projectId: number }) {
  const { projects } = useProjects();
  const panel = usePanel({ surface: "side", scope: projectId });
  return <Panel panel={panel} onNewChat={() => panel.openNew({ projectId })} terminals={terminalTargets(projects, projectId)} sidebar={{}} />;
}

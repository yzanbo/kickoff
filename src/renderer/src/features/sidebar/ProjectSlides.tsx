import type { ReactNode } from "react";
import type { Chat, ChatGroup } from "@shared/types";
import { cx } from "@/lib/cx";
import { ProjectListHead } from "./ProjectListHead";
import { stateCounts } from "@/features/chat/chatState";
import type { ProjectNavController } from "./useProjectNav";
import { WorkspaceDots } from "./WorkspaceDots";
import { WorkspacePage } from "./WorkspacePage";
import { NO_CHATS, useChatsWithChildrenByProject } from "@/stores/chats";
import { NO_GROUPS } from "@/stores/groups";

/**
 * スライド: 1 ページ = 1 プロジェクトのチャット一覧で、スワイプ・丸・ショートカットで切り替える。
 * 横スライドは丸を下に並べて横にスワイプ、縦スライド（rail）は丸を左に縦に並べて縦にスワイプする。
 * waitingEmpty（要対応がないとき）・selectionBar は ProjectNav が作る
 */
export function ProjectSlides({
  nav,
  chats,
  groups,
  onNewProject,
  waitingEmpty,
  topInbox,
  selectionBar,
}: {
  nav: ProjectNavController;
  chats: Record<number, Chat[]>;
  groups: Record<number, ChatGroup[]>;
  onNewProject: () => void;
  waitingEmpty: ReactNode;
  /** 要対応を上にまとめる表示のとき、スライドの上に置くまとまり（高さに上限を付けて、中でスクロールする） */
  topInbox: ReactNode;
  selectionBar: ReactNode;
}) {
  const { ordered, index, swipe, collapsedMap, filterByWaiting, isArchived, reorder, go, projectMenu, pending, compact, compactProjects } = nav;
  const rail = nav.layout === "rail";
  // 丸の角の状態ごとの数は、子チャットも数える（見出しの数・要対応と同じ）
  const counted = useChatsWithChildrenByProject();
  const switcher = (
    <div className="workspace-switcher" {...swipe.stripHandlers}>
      <WorkspaceDots
        projects={ordered}
        index={index}
        countsOf={(id) => stateCounts(counted[id] ?? NO_CHATS, pending)}
        isArchived={isArchived}
        reorder={reorder}
        onGo={go}
        onMenu={projectMenu.open}
        onNewProject={onNewProject}
      />
    </div>
  );
  return (
    <div className={cx("workspaces", rail && "rail", compact && "compact", compactProjects && "compact-projects")}>
      <ProjectListHead {...nav.head} />
      {topInbox && <div className="waiting-inbox-slot">{topInbox}</div>}
      <div className="workspace-body">
      {rail && switcher}
      <div
        className="workspace-viewport"
        ref={swipe.viewportRef}
        {...swipe.handlers}
      >
        {waitingEmpty}
        <div className="workspace-track" ref={swipe.trackRef}>
          {ordered.map((p, i) => (
            <WorkspacePage
              key={p.id}
              project={p}
              chats={chats[p.id] ?? NO_CHATS}
              groups={groups[p.id] ?? NO_GROUPS}
              hidden={i !== index}
              collapsed={!filterByWaiting && collapsedMap.get(p.id)}
              onCollapsedChange={collapsedMap.set}
            />
          ))}
        </div>
      </div>
      </div>

      {selectionBar}
      {!rail && switcher}
      {projectMenu.element}
    </div>
  );
}

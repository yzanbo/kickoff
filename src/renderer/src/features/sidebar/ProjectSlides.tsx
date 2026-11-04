import type { ReactNode } from "react";
import type { Run, RunGroup } from "@shared/types";
import { cx } from "@/lib/cx";
import { ProjectListHead } from "./ProjectListHead";
import { stateCounts } from "@/features/chat/chatState";
import { NO_GROUPS, type ProjectNavController } from "./useProjectNav";
import { WorkspaceDots } from "./WorkspaceDots";
import { WorkspacePage } from "./WorkspacePage";

/**
 * スライド: 1 ページ = 1 プロジェクトのチャット一覧で、スワイプ・丸・ショートカットで切り替える。
 * 横スライドは丸を下に並べて横にスワイプ、縦スライド（rail）は丸を左に縦に並べて縦にスワイプする。
 * waitingEmpty（自分待ちがないとき）・selectionBar は ProjectNav が作る
 */
export function ProjectSlides({
  nav,
  runs,
  groups,
  onNewProject,
  waitingEmpty,
  selectionBar,
}: {
  nav: ProjectNavController;
  runs: Record<number, Run[]>;
  groups: Record<number, RunGroup[]>;
  onNewProject: () => void;
  waitingEmpty: ReactNode;
  selectionBar: ReactNode;
}) {
  const { ordered, index, swipe, collapsedMap, waitingOnly, isArchived, reorder, go, projectMenu, pending, compact, compactProjects } = nav;
  const rail = nav.layout === "rail";
  const switcher = (
    <div className="workspace-switcher" {...swipe.stripHandlers}>
      <WorkspaceDots
        projects={ordered}
        index={index}
        countsOf={(id) => stateCounts(runs[id] ?? [], pending)}
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
              runs={runs[p.id] ?? []}
              groups={groups[p.id] ?? NO_GROUPS}
              hidden={i !== index}
              collapsed={!waitingOnly && collapsedMap.get(p.id)}
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

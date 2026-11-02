import type { ReactNode } from "react";
import type { Run, RunGroup } from "../../../../core/types";
import { cx } from "../../cx";
import { ProjectListHead } from "./ProjectListHead";
import { stateCounts } from "./sidebarFlags";
import { NO_GROUPS, type ProjectNavController } from "./useProjectNav";
import { WorkspaceDots } from "./WorkspaceDots";
import { WorkspacePage } from "./WorkspacePage";

/**
 * 横スライド: 1 ページ = 1 プロジェクトのチャット一覧で、横スワイプ・下の丸・ショートカットで切り替える。
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
  return (
    <div className={cx("workspaces", compact && "compact", compactProjects && "compact-projects")}>
      <ProjectListHead {...nav.head} />
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

      {selectionBar}
      <div className="workspace-switcher">
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
      {projectMenu.element}
    </div>
  );
}

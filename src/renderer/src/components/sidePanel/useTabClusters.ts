import type { Run } from "../../../../core/types";
import { useGroupNames } from "../../groupNames";
import { useSharedChoice } from "../../hooks/useStoredState";
import { useProjects } from "../../projectsContext";
import { PANEL_TAB_GROUPING_KEY } from "../../storageKeys";
import { workplaceOf } from "../../worktree/workplace";
import { useWorktreeLists } from "../../worktree/worktreeBranches";
import { OTHER_CLUSTER, TAB_GROUPINGS, type ClusterOf, type TabGrouping } from "./tabClusters";
import type { PanelTab, SidePanelController } from "./useSidePanel";

/** 右のパネルのタブの列のまとめ方（ボードの右のパネル・プロジェクトのチャット欄・すべてのペインで共通。初めはまとめない） */
export const useTabGrouping = () => useSharedChoice<TabGrouping>(PANEL_TAB_GROUPING_KEY, TAB_GROUPINGS, "none");

/** タブのプロジェクト（ブラウザはどのプロジェクトにも入らない） */
const projectOfTab = (t: PanelTab): number | undefined => (t.kind === "browser" || t.kind === "terminal" ? undefined : t.projectId);

/**
 * タブがどのまとまりに入るか（grouping が none なら使わない）。
 * グループ別: チャット・サブエージェントはそのチャットのグループ、新しいチャットは作成先のグループ（なければ「グループなし」）。
 * 作業場所別: チャット・サブエージェントはそのチャットの作業場所（ブランチ。workplaceOf）、新しいチャットはプロジェクトの本体、
 * ターミナルは開いたフォルダ（本体・ワークツリー）。ブラウザ（作業場所別ではフォルダの分からないターミナルも）は「その他」。
 * いくつかのプロジェクトのタブが並ぶとき（全プロジェクトのボード）は、名前の前にプロジェクト名を添える。
 * clusterOfRun はチャットがどのまとまりに入るか（タブで開いていないチャットも。まとまりの札から開く状態ごとの一覧に使う）
 */
export function useTabClusters(
  panel: SidePanelController,
  grouping: TabGrouping,
): { clusterOf: (key: string) => ClusterOf; clusterOfRun: (run: Run) => ClusterOf } {
  const { projectsById, projectName } = useProjects();
  const projectIds = [...new Set(panel.tabs.flatMap((t) => projectOfTab(t) ?? []))];
  const groupName = useGroupNames(grouping === "group" ? projectIds : []);
  // ターミナルのフォルダから引くプロジェクト（本体のフォルダか、その隣のワークツリーの置き場 <名前>-worktrees/ の中）
  const terminalCwds = panel.tabs.flatMap((t) => (t.kind === "terminal" ? [t.cwd] : []));
  const terminalProjects = [...projectsById.values()]
    .filter((p) => terminalCwds.some((cwd) => cwd === p.repo_path || cwd.startsWith(`${p.repo_path}-worktrees/`)))
    .map((p) => p.id);
  const worktrees = useWorktreeLists(grouping === "worktree" ? [...projectIds, ...terminalProjects] : []);
  const runOf = (id: number, fallback?: Run) => panel.runs.find((r) => r.id === id) ?? fallback;
  const many = projectIds.length > 1;
  const named = (projectId: number, c: ClusterOf): ClusterOf => (many ? { ...c, label: `${projectName(projectId)} · ${c.label}` } : c);

  const byGroup = (projectId: number, groupId: number | null | undefined): ClusterOf => {
    const name = groupId ? groupName(projectId, groupId) : undefined;
    return named(projectId, {
      key: `p${projectId}:g${groupId ?? ""}`,
      label: name ?? "グループなし",
      title: name ? `グループ: ${name}` : "グループに入っていないチャット",
      projectId,
      groupId: groupId ?? null,
    });
  };
  const byWorkplace = (projectId: number, run: Pick<Run, "worktree_path" | "branch">): ClusterOf => {
    const wp = workplaceOf(run, worktrees(projectId));
    const label = wp.kind === "main" ? `本体${wp.name ? ` · ${wp.name}` : ""}` : wp.name;
    return named(projectId, { key: `p${projectId}:w${wp.key}`, label, title: wp.title, projectId });
  };
  /** ターミナルの開いたフォルダが、どのプロジェクトの本体・ワークツリーか */
  const terminalWorkplace = (cwd: string): ClusterOf => {
    for (const id of [...projectIds, ...terminalProjects]) {
      const p = projectsById.get(id);
      if (p?.repo_path === cwd) return byWorkplace(id, { worktree_path: "", branch: "" });
      if (worktrees(id)?.some((w) => !w.main && w.path === cwd)) return byWorkplace(id, { worktree_path: cwd, branch: "" });
    }
    return OTHER_CLUSTER;
  };

  const clusterOfRun = (run: Run): ClusterOf => (grouping === "group" ? byGroup(run.project_id, run.group_id) : byWorkplace(run.project_id, run));
  const clusterOf = (key: string): ClusterOf => {
    const t = panel.tabs.find((x) => x.key === key);
    if (!t || t.kind === "browser") return OTHER_CLUSTER;
    if (grouping === "group") {
      if (t.kind === "terminal") return OTHER_CLUSTER;
      if (t.kind === "new") return byGroup(t.projectId, t.group);
      const run = t.kind === "chat" ? runOf(t.id, t.run) : runOf(t.runId);
      return byGroup(t.projectId, run?.group_id);
    }
    if (t.kind === "terminal") return terminalWorkplace(t.cwd);
    if (t.kind === "new") return byWorkplace(t.projectId, { worktree_path: "", branch: "" });
    const run = t.kind === "chat" ? runOf(t.id, t.run) : runOf(t.runId);
    return byWorkplace(t.projectId, run ?? { worktree_path: "", branch: "" });
  };
  return { clusterOf, clusterOfRun };
}

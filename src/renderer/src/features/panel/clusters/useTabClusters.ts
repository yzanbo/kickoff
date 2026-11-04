import type { Chat } from "@shared/types";
import { useGroupNames, useProjectGroups } from "@/features/group/groupNames";
import { useSharedChoice } from "@/hooks/useStoredState";
import { useProjects } from "@/app/projectsContext";
import { panelTabGroupingKey } from "@/lib/storageKeys";
import { workplaceOf } from "@/features/worktree/workplace";
import { useWorktreeLists } from "@/features/worktree/worktreeBranches";
import { OTHER_CLUSTER, TAB_GROUPINGS, type ClusterOf, type ClusterSeed, type TabGrouping } from "./tabClusters";
import type { PanelSurface } from "@/features/panel/state/panelKinds";
import type { PanelTab, PanelController } from "@/features/panel/usePanel";

/** タブの列のまとめ方（欄ごと: ボードの右のパネル・右端のチャット欄・フッターで別々に覚える。欄の中のペインでは共通。初めはまとめない） */
export const useTabGrouping = (surface: PanelSurface) => useSharedChoice<TabGrouping>(panelTabGroupingKey(surface), TAB_GROUPINGS, "none");

/** タブのプロジェクト（ブラウザはどのプロジェクトにも入らない） */
const projectOfTab = (t: PanelTab): number | undefined => (t.kind === "browser" || t.kind === "terminal" ? undefined : t.projectId);

/**
 * タブがどのまとまりに入るか（grouping が none なら使わない）。
 * グループ別: チャット・サブエージェントはそのチャットのグループ、新しいチャットは作成先のグループ（なければ「グループなし」）。
 * 作業場所別: チャット・サブエージェントはそのチャットの作業場所（ブランチ。workplaceOf）、新しいチャットはプロジェクトの本体、
 * ターミナルは開いたフォルダ（本体・ワークツリー）。ブラウザ（作業場所別ではフォルダの分からないターミナルも）は「その他」。
 * いくつかのプロジェクトのタブが並ぶとき（全プロジェクトのボード）は、名前の前にプロジェクト名を添える。
 * clusterOfChat はチャットがどのまとまりに入るか（タブで開いていないチャットも。まとまりの札から開く状態ごとの一覧に使う）。
 * order はグループ別のとき先に並べるまとまり: サイドバーと連動させ、プロジェクトごとに自分で作ったグループをサイドバーと同じ並びで
 * （チャットのタブがなくても札を出す。作ったグループがすぐタブの列にも出る）、そのあとに「グループなし」（タブがあるときだけ）。
 * サイドバーと同じく、固定したチャットは「固定」（いちばん前）、アーカイブ済みは「アーカイブ済み」（後ろ）に抜き出す
 * （グループ・作業場所の札の数がサイドバーの見出しの数と同じになる。どちらのまとめ方でも）
 */
export function useTabClusters(
  panel: PanelController,
  grouping: TabGrouping,
): { clusterOf: (key: string) => ClusterOf; clusterOfChat: (chat: Chat) => ClusterOf; order: ClusterSeed[] } {
  const { projectsById, projectName } = useProjects();
  const projectIds = [...new Set(panel.tabs.flatMap((t) => projectOfTab(t) ?? []))];
  const groupName = useGroupNames(grouping === "group" ? projectIds : []);
  const groupsOf = useProjectGroups(grouping === "group" ? projectIds : []);
  // ターミナルのフォルダから引くプロジェクト（本体のフォルダか、その隣のワークツリーの置き場 <名前>-worktrees/ の中）
  const terminalCwds = panel.tabs.flatMap((t) => (t.kind === "terminal" ? [t.cwd] : []));
  const terminalProjects = [...projectsById.values()]
    .filter((p) => terminalCwds.some((cwd) => cwd === p.repo_path || cwd.startsWith(`${p.repo_path}-worktrees/`)))
    .map((p) => p.id);
  const worktrees = useWorktreeLists(grouping === "worktree" ? [...projectIds, ...terminalProjects] : []);
  const chatOf = (id: number, fallback?: Chat) => panel.chats.find((r) => r.id === id) ?? fallback;
  const many = projectIds.length > 1;
  const named = (projectId: number, c: ClusterOf): ClusterOf => (many ? { ...c, label: `${projectName(projectId)} · ${c.label}` } : c);

  const byGroup = (projectId: number, groupId: number | null | undefined): ClusterOf => {
    const name = groupId ? groupName(projectId, groupId) : undefined;
    // 自分で作ったグループは覚えた色（同じプロジェクトのほかのグループと被らない色）
    const hue = groupId ? groupsOf(projectId).find((g) => g.id === groupId)?.hue : undefined;
    return named(projectId, {
      ...(hue !== undefined && { hue }),
      key: `p${projectId}:g${groupId ?? ""}`,
      label: name ?? "グループなし",
      title: name ? `グループ: ${name}` : "グループに入っていないチャット",
      projectId,
      groupId: groupId ?? null,
      groupName: name,
    });
  };
  const byWorkplace = (projectId: number, chat: Pick<Chat, "worktree_path" | "branch">): ClusterOf => {
    const wp = workplaceOf(chat, worktrees(projectId));
    const label = wp.kind === "main" ? `本体${wp.name ? ` · ${wp.name}` : ""}` : wp.name;
    return named(projectId, { key: `p${projectId}:w${wp.key}`, label, title: wp.title, projectId });
  };
  /** ターミナルの開いたフォルダが、どのプロジェクトの本体・ワークツリーか */
  const terminalWorkplace = (cwd: string): ClusterOf => {
    for (const id of [...projectIds, ...terminalProjects]) {
      const p = projectsById.get(id);
      if (p?.repo_path === cwd) return byWorkplace(id, { worktree_path: null, branch: null });
      if (worktrees(id)?.some((w) => !w.main && w.path === cwd)) return byWorkplace(id, { worktree_path: cwd, branch: null });
    }
    return OTHER_CLUSTER;
  };

  // サイドバーと同じく抜き出すまとまり（固定・アーカイブ済み）
  const pinnedCluster = (projectId: number): ClusterOf =>
    named(projectId, { key: `p${projectId}:pinned`, label: "固定", title: "固定したチャット（サイドバーの「固定」と同じ）", projectId });
  const archivedCluster = (projectId: number): ClusterOf =>
    named(projectId, { key: `p${projectId}:archived`, label: "アーカイブ済み", title: "アーカイブ済みのチャット（サイドバーの「アーカイブ済み」と同じ）", projectId });
  /** チャットの入るまとまり。アーカイブ済み → 固定 → グループ（作業場所）の順に決める（サイドバーの分け方と同じ） */
  const ofChat = (projectId: number, chat: Chat | undefined): ClusterOf => {
    if (chat?.archived_at) return archivedCluster(projectId);
    if (chat?.pinned) return pinnedCluster(projectId);
    return grouping === "group" ? byGroup(projectId, chat?.group_id) : byWorkplace(projectId, chat ?? { worktree_path: null, branch: null });
  };
  const clusterOfChat = (chat: Chat): ClusterOf => ofChat(chat.project_id, chat);
  const clusterOf = (key: string): ClusterOf => {
    const t = panel.tabs.find((x) => x.key === key);
    if (!t || t.kind === "browser") return OTHER_CLUSTER;
    if (t.kind === "terminal") return grouping === "group" ? OTHER_CLUSTER : terminalWorkplace(t.cwd);
    if (t.kind === "new") return grouping === "group" ? byGroup(t.projectId, t.group) : byWorkplace(t.projectId, { worktree_path: null, branch: null });
    return ofChat(t.projectId, t.kind === "chat" ? chatOf(t.id, t.chat) : chatOf(t.chatId));
  };
  const order: ClusterSeed[] = projectIds.flatMap((id) => [
    { cluster: pinnedCluster(id), keepEmpty: false },
    ...(grouping === "group"
      ? [...groupsOf(id).map((g) => ({ cluster: byGroup(id, g.id), keepEmpty: true })), { cluster: byGroup(id, null), keepEmpty: false }]
      : []),
    { cluster: archivedCluster(id), keepEmpty: false, tail: true },
  ]);
  return { clusterOf, clusterOfChat, order };
}

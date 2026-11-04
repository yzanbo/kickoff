import type { Chat } from "@shared/types";
import { useSetting } from "@/hooks/useSetting";
import { useProjects } from "@/stores/projects";
import { panelTabGrouping } from "@/lib/storageKeys";
import type { ChatGrouping } from "@/features/chatList/chatGrouping";
import { chatHead, draftHead, groupHeads, workplaceHead, type BucketHead } from "@/features/chatList/buckets";
import { useBucketContext } from "@/features/chatList/useChatBuckets";
import { OTHER_CLUSTER } from "./tabClusters";
import type { PanelSurface } from "@/features/panel/state/panelKinds";
import type { PanelTab, PanelController } from "@/features/panel/usePanel";

/** タブの列のまとめ方（欄ごと: ボードの右のパネル・右端のチャット欄・フッターで別々に覚える。欄の中のペインでは共通。初めはまとめない） */
export const useTabGrouping = (surface: PanelSurface) => useSetting(panelTabGrouping(surface));

/** タブのプロジェクト（ブラウザはどのプロジェクトにも入らない） */
const projectOfTab = (t: PanelTab): number | undefined => (t.kind === "browser" || t.kind === "terminal" ? undefined : t.projectId);

/** 固定・アーカイブ済みの札の説明（サイドバーの同じまとまりと同じものだと分かるように） */
const TITLES: Partial<Record<BucketHead["kind"], string>> = {
  pinned: "固定したチャット（サイドバーの「固定」と同じ）",
  archived: "アーカイブ済みのチャット（サイドバーの「アーカイブ済み」と同じ）",
};

/**
 * タブがどのまとまりに入るか（grouping が none なら使わない）。まとまりはサイドバー・ボードと同じ bucketChats の決め方（chatHead / draftHead）で、
 * キーも同じ: グループ別はチャット・サブエージェントのグループ、新しいチャットは作成先のグループ（もうないグループのものはグループなし）。
 * 作業場所別はチャット・サブエージェントの作業場所（ブランチ。workplaceOf）、新しいチャットはプロジェクトの本体、ターミナルは開いたフォルダ（本体・ワークツリー）。
 * ブラウザ（グループ別ではターミナルも）は「その他」。いくつかのプロジェクトのタブが並ぶとき（全プロジェクトのボード）は、名前の前にプロジェクト名を添える。
 * サイドバーと同じく、固定したチャットは「固定」（いちばん前）、アーカイブ済みは「アーカイブ済み」（後ろ）に抜き出す
 * （グループ・作業場所の札の数がサイドバーの見出しの数と同じになる。どちらのまとめ方でも）。
 * clusterOfChat はチャットがどのまとまりに入るか（タブで開いていないチャットも。まとまりの札から開く状態ごとの一覧に使う）。
 * seeds はグループ別のとき、タブがなくても札を出すまとまり: サイドバーと連動させ、プロジェクトごとに自分で作ったグループをサイドバーと同じ並びで
 * （作ったグループがすぐタブの列にも出る）。projectOrder はまとまりを並べるプロジェクトの順（タブに出てくる順）
 */
export function useTabClusters(
  panel: PanelController,
  grouping: ChatGrouping,
): { clusterOf: (key: string) => BucketHead; clusterOfChat: (chat: Chat) => BucketHead; seeds: BucketHead[]; projectOrder: number[] } {
  const { projectsById, projectName } = useProjects();
  const projectIds = [...new Set(panel.tabs.flatMap((t) => projectOfTab(t) ?? []))];
  const by = grouping === "group" ? "group" : "worktree";
  // ターミナルのフォルダから引くプロジェクト（本体のフォルダか、その隣のワークツリーの置き場 <名前>-worktrees/ の中）
  const terminalCwds = panel.tabs.flatMap((t) => (t.kind === "terminal" ? [t.cwd] : []));
  const terminalProjects = [...projectsById.values()]
    .filter((p) => terminalCwds.some((cwd) => cwd === p.repo_path || cwd.startsWith(`${p.repo_path}-worktrees/`)))
    .map((p) => p.id);
  // 自分で作ったグループ（サイドバーと同じ並び）・ワークツリーの一覧（作業場所別のとき。ターミナルのプロジェクトも）
  const ctx = useBucketContext(grouping === "none" ? [] : by, by === "worktree" ? [...projectIds, ...terminalProjects] : projectIds);
  const chatOf = (id: number, fallback?: Chat) => panel.chats.find((r) => r.id === id) ?? fallback;
  const many = projectIds.length > 1;

  /** 札に出す形: 本体は「本体 · main」（札が小さいので 1 つの名前にする）、固定・アーカイブ済みはサイドバーと同じものだと添え、いくつかのプロジェクトならプロジェクト名を前に */
  const present = (head: BucketHead): BucketHead => {
    const place = head.place;
    const label = place?.kind === "main" ? `本体${place.name ? ` · ${place.name}` : ""}` : head.label;
    const title = TITLES[head.kind] ?? head.title;
    return { ...head, title, label: many && head.projectId !== undefined ? `${projectName(head.projectId)} · ${label}` : label };
  };
  const clusterOfChat = (chat: Chat): BucketHead => present(chatHead(chat, by, ctx, { pinned: true, archived: "bucket" }) ?? OTHER_CLUSTER);
  /** チャットの分からないタブ（まだ届いていない）・新しいチャットは、作成先（グループなし・本体）のまとまり */
  const ofTarget = (projectId: number, group?: number): BucketHead => present(draftHead({ projectId, group }, by, ctx) ?? OTHER_CLUSTER);
  /** ターミナルの開いたフォルダが、どのプロジェクトの本体・ワークツリーか */
  const terminalWorkplace = (cwd: string): BucketHead => {
    for (const id of [...projectIds, ...terminalProjects]) {
      if (projectsById.get(id)?.repo_path === cwd) return present(workplaceHead(id, { worktree_path: null, branch: null }, ctx));
      if (ctx.worktreesOf?.(id)?.some((w) => !w.main && w.path === cwd)) return present(workplaceHead(id, { worktree_path: cwd, branch: null }, ctx));
    }
    return OTHER_CLUSTER;
  };
  const clusterOf = (key: string): BucketHead => {
    const t = panel.tabs.find((x) => x.key === key);
    if (!t || t.kind === "browser") return OTHER_CLUSTER;
    if (t.kind === "terminal") return grouping === "group" ? OTHER_CLUSTER : terminalWorkplace(t.cwd);
    if (t.kind === "new") return ofTarget(t.projectId, t.group);
    const chat = t.kind === "chat" ? chatOf(t.id, t.chat) : chatOf(t.chatId);
    return chat ? clusterOfChat(chat) : ofTarget(t.projectId);
  };
  const seeds = grouping === "group" ? projectIds.flatMap((id) => groupHeads(id, ctx).filter((h) => h.kind === "group").map(present)) : [];
  return { clusterOf, clusterOfChat, seeds, projectOrder: projectIds };
}

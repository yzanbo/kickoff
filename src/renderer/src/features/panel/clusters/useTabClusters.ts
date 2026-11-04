import type { Chat } from "@shared/types";
import { useSetting } from "@/hooks/useSetting";
import { useProjects } from "@/stores/projects";
import { panelTabGrouping } from "@/lib/storageKeys";
import type { ChatGrouping } from "@/features/chatList/chatGrouping";
import type { BucketHead } from "@/features/chatList/buckets";
import { chatHead, draftHead, groupHeads, workplaceHead } from "@/features/chatList/bucketHeads";
import { useBucketContext } from "@/features/chatList/useChatBuckets";
import { OTHER_CLUSTER } from "./tabClusters";
import type { PanelSurface } from "@/features/panel/surfaces";
import { specOf, type ClusterResolver } from "@/features/panel/tabs/tabKinds";
import type { PanelController } from "@/features/panel/usePanel";

/** タブの列のまとめ方（欄ごと: ボードの右のパネル・右端のチャット欄・フッターで別々に覚える。欄の中のペインでは共通。初めはまとめない） */
export const useTabGrouping = (surface: PanelSurface) => useSetting(panelTabGrouping(surface));

/** 固定・アーカイブ済みの札の説明（サイドバーの同じまとまりと同じものだと分かるように） */
const TITLES: Partial<Record<BucketHead["kind"], string>> = {
  pinned: "固定したチャット（サイドバーの「固定」と同じ）",
  archived: "アーカイブ済みのチャット（サイドバーの「アーカイブ済み」と同じ）",
};

/**
 * タブがどのまとまりに入るか（grouping が none なら使わない）。どのタブがどのまとまりに入るかは種類の表（tabKinds.ts の cluster）で決め、
 * まとまりはサイドバー・ボードと同じ bucketChats の決め方（chatHead / draftHead / workplaceHead）・同じキー: グループ別はチャット・サブエージェントのグループ、
 * 新しいチャットは作成先のグループ（もうないグループのものはグループなし）。作業場所別はチャット・サブエージェントの作業場所（ブランチ。workplaceOf）、
 * 新しいチャットはプロジェクトの本体、ターミナルは開いたフォルダ（本体・ワークツリー）。ブラウザ（グループ別ではターミナルも）は「その他」。
 * いくつかのプロジェクトのタブが並ぶとき（全プロジェクトのボード）は、名前の前にプロジェクト名を添える。
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
  const projectIds = [...new Set(panel.tabs.flatMap((t) => specOf(t).projectOf(t) ?? []))];
  const by = grouping === "group" ? "group" : "worktree";
  // 自分で作ったグループ（サイドバーと同じ並び）・ワークツリーの一覧（作業場所別のとき）
  const ctx = useBucketContext(grouping === "none" ? [] : by, projectIds);
  const many = projectIds.length > 1;

  /** 札に出す形: 本体は「本体 · main」（札が小さいので 1 つの名前にする）、固定・アーカイブ済みはサイドバーと同じものだと添え、いくつかのプロジェクトならプロジェクト名を前に */
  const present = (head: BucketHead): BucketHead => {
    const place = head.place;
    const label = place?.kind === "main" ? `本体${place.name ? ` · ${place.name}` : ""}` : head.label;
    const title = TITLES[head.kind] ?? head.title;
    return { ...head, title, label: many && head.projectId !== undefined ? `${projectName(head.projectId)} · ${label}` : label };
  };
  const clusterOfChat = (chat: Chat): BucketHead => present(chatHead(chat, by, ctx, { pinned: true, archived: "bucket" }) ?? OTHER_CLUSTER);
  const resolve: ClusterResolver = {
    chatById: (id) => panel.chats.find((r) => r.id === id),
    ofChat: clusterOfChat,
    ofTarget: (projectId, group) => present(draftHead({ projectId, group }, by, ctx) ?? OTHER_CLUSTER),
    // ターミナルの開いたフォルダが、そのプロジェクトの本体かワークツリーか（グループ別では「その他」）
    ofFolder: (projectId, cwd) =>
      by === "group" ? OTHER_CLUSTER : present(workplaceHead(projectId, { worktree_path: projectsById.get(projectId)?.repo_path === cwd ? null : cwd, branch: null }, ctx)),
  };
  const clusterOf = (key: string): BucketHead => {
    const t = panel.tabs.find((x) => x.key === key);
    return t ? specOf(t).cluster(t, resolve) : OTHER_CLUSTER;
  };
  const seeds = grouping === "group" ? projectIds.flatMap((id) => groupHeads(id, ctx).filter((h) => h.kind === "group").map(present)) : [];
  return { clusterOf, clusterOfChat, seeds, projectOrder: projectIds };
}

import { useMemo, useState } from "react";
import { boardColumnOf, needsAttention } from "@shared/chat/state";
import type { Chat } from "@shared/chat/types";
import { useChatStates } from "@/features/chat/ui";
import { useChatSearch } from "@/features/chat/ui/chatSearch";
import type { CountedColumn } from "@/features/chat/ui/state/chatState";
import { splitAtUngrouped } from "@/features/groups/ui";
import { useSetting } from "@/foundation/ui/hooks/useSetting";
import type { PlacedDraft } from "@/features/chatPanel/ui";
import { chatListOptions, chatListSettings, pinnedKey, projectKey, useChatBuckets, useChatLayout, type BucketHead, type ChatBucket } from "@/features/chatList/ui";
import { storage } from "./storage";
import { useWaitingView } from "./waitingView";
import { waitingAxes } from "./waitingAxes";
import { inboxSections, waitingSince } from "./inboxOrder";
import { splitPinnedDrafts } from "./sidebarDrafts";
import { useProjectDrafts } from "./DraftRows";
import { unplacedDrafts, useDraftPlacement, type DraftSlot } from "./useDraftPlacement";

type Bucket = ChatBucket<PlacedDraft>;

/** チャットのないグループも出す（グループなしは出すかを見出しの決まりで決めるので、いつも作っておく）。絞り込み中は一致するものだけ */
const KEEP_GROUPS = (head: BucketHead) => head.kind === "group" || head.kind === "ungrouped";
const KEEP_UNGROUPED = (head: BucketHead) => head.kind === "ungrouped";
const NO_DRAFTS: PlacedDraft[] = [];
const ZERO = { running: 0, needs_input: 0, unread: 0 };
/** 見出しの下に並べるまとまり（固定・アーカイブ済み・自分で作ったグループ以外） */
const isMainBucket = (b: BucketHead) => b.kind !== "pinned" && b.kind !== "archived" && b.kind !== "group";

/**
 * サイドバーの 1 プロジェクトのチャットの行の絞り込みと、上から並ぶまとまり（分けるのは bucketChats）。
 * 検索（プロジェクトの検索欄か、すべてのプロジェクトをまたぐ検索欄 searchAll）・要対応・見出しの状態の数で絞り、
 * 要対応（プロジェクト内の上に）→ いちばん上の下書き → 固定 → グループ → 見出しの下の一覧（グループなし・作業場所・状態）→ グループ → アーカイブ済み に並べる
 * （「No Group」はグループの並びの中の ungroupedAt の位置。アーカイブ済みは、グループ別・作業場所別ならまとまりごとの archived、まとめないときはいちばん下）。
 * 下書きはまとまりの drafts（手動の並びでチャットの行の後ろに置くものは draftsAfter）
 */
export function useWorkspaceRows({
  projectId,
  chats,
  counted,
  groupIds,
  ungroupedAt,
  searchAll,
  collapsed,
}: {
  projectId: number;
  chats: Chat[];
  /** 要対応・状態ごとの数で数えるチャット（アーカイブしていないもの。子チャットも入れる）。要対応・状態で絞るときは、合う子チャットも行に出す */
  counted: Chat[];
  /** プロジェクトのグループ（並び順） */
  groupIds: readonly number[];
  /** グループの並びの中の「No Group」の位置 */
  ungroupedAt: number;
  searchAll: string;
  /** チャット一覧を閉じているか（閉じている間は、作業場所で分けるためのワークツリーの一覧を読みに行かない） */
  collapsed: boolean;
}) {
  const { grouping, order } = useChatLayout();
  // 要対応（回答待ち・未読）だけを出すか（表示が「プロジェクトで絞る」のときだけ絞る）・プロジェクト内の上にまとめるか
  const [waitingOn] = useSetting(storage.settings.waitingOnly);
  const [waitingView] = useWaitingView();
  const waitingOnly = waitingOn && waitingView === "filter";
  const [showArchived] = useSetting(chatListSettings.showArchived);
  // プロジェクト内の検索: チャット名と、やり取りの中身（サーバーで全文検索）の両方で絞り込む
  const [query, setQuery] = useState("");
  const { keyword, matches } = useChatSearch(query || searchAll);
  // 見出しの状態の数を押して、その状態のチャットだけに絞る（このプロジェクトだけ。もう一度押すと戻す）
  const [stateFilter, setStateFilter] = useState<CountedColumn | null>(null);
  // 検索・要対応・状態で絞り込んでいる間は、まとまりを開いて見せ、空のまとまりは隠す
  const filtering = Boolean(keyword) || waitingOnly || stateFilter !== null;
  const { stateOf, approvals } = useChatStates();
  const showGroups = grouping === "group" && groupIds.length > 0;
  // 送る前の新しいチャット（下書き）。グループ・作業場所でまとめるときは作成先のまとまりの中（もうないグループのものはグループなし）、まとめないときはいちばん上
  // （ピン留めしたものは「固定」）。自分が続きを書くものなので「要対応」でも出す（検索・状態での絞り込み中は出さない）
  const allDrafts = useProjectDrafts(projectId);
  const showDrafts = !keyword && stateFilter === null;
  const { drafts, pinnedDrafts } = useMemo(() => splitPinnedDrafts(allDrafts, grouping === "none"), [allDrafts, grouping]);
  const nestedDrafts = grouping !== "none";

  // 出すチャット: アーカイブしていないものは検索・要対応・状態で絞り、アーカイブ済みは（出すときだけ）検索で絞る（要対応・状態で絞っているときは出さない。
  // 作業中・回答待ち・未読はアーカイブしていないチャットだけを数えるので、出すと数と合わない）。要対応・状態で絞るときは、合う子チャットも行に並べる
  const shown = useMemo(() => {
    const fits = (chat: Chat) => {
      const state = stateOf(chat);
      return matches(chat) && (!waitingOnly || needsAttention(state)) && (stateFilter === null || boardColumnOf(state) === stateFilter);
    };
    const top = chats.filter((chat) => (chat.archived_at ? showArchived && !waitingOnly && stateFilter === null && matches(chat) : fits(chat)));
    if (!waitingOnly && stateFilter === null) return top;
    const children = counted.filter((chat) => chat.parent_chat_id !== null && fits(chat));
    return children.length > 0 ? [...top, ...children] : top;
  }, [chats, counted, showArchived, waitingOnly, matches, stateOf, stateFilter]);
  const buckets = useChatBuckets(shown, {
    ...chatListOptions(grouping, order),
    project: projectId,
    drafts: nestedDrafts && showDrafts ? drafts : NO_DRAFTS,
    keepEmpty: filtering ? KEEP_UNGROUPED : KEEP_GROUPS,
    idle: collapsed,
  });
  const main = buckets.filter(isMainBucket);
  const mainRows = useMemo(() => buckets.filter(isMainBucket).flatMap((b) => b.chats), [buckets]);

  // 手動の並びのときは、下書きの行をタブの列での位置に合わせてチャットの行の間に置く（置かないものは、まとまりのいちばん上）
  const topDraftList = showDrafts && !nestedDrafts ? drafts : NO_DRAFTS;
  const slots = useMemo<DraftSlot[]>(
    () =>
      nestedDrafts
        ? buckets.filter((b) => b.drafts.length > 0).map((b) => ({ drafts: b.drafts.filter((d) => !d.pinned), chats: b.chats.filter((c) => !c.pinned) }))
        : [{ drafts: topDraftList.filter((d) => !d.pinned), chats: mainRows }],
    [nestedDrafts, buckets, topDraftList, mainRows],
  );
  const draftsAfter = useDraftPlacement(slots, chats, projectId, order === "manual" && !collapsed);
  const withUnplaced = (b: Bucket): Bucket => {
    const rest = unplacedDrafts(b.drafts, draftsAfter);
    return rest === b.drafts ? b : { ...b, drafts: rest };
  };
  const draftCounts = useMemo(() => new Map(buckets.filter((b) => b.drafts.length > 0).map((b) => [b.key, b.drafts.length])), [buckets]);

  // 要対応の「プロジェクト内の上に」: このプロジェクトの待っているチャットを、いちばん上のまとまりに状態順で並べる（下のいつもの一覧にも残す。検索・状態で絞っている間は出さない）
  const showWaitingTop = waitingOn && waitingAxes(waitingView).scope === "project" && !keyword && !stateFilter;
  const waitingTop = useMemo(
    () => (showWaitingTop ? inboxSections(counted, stateOf, (chat, state) => waitingSince(chat, state, approvals)).flatMap((s) => s.chats) : []),
    [showWaitingTop, counted, stateOf, approvals],
  );

  const visibleCount = shown.filter((c) => !c.archived_at).length;
  const pinned = buckets.find((b) => b.kind === "pinned");
  const groups = buckets.filter((b) => b.kind === "group").map(withUnplaced);
  const ungroupedBucket = main.find((b) => b.kind === "ungrouped");
  const ungrouped = ungroupedBucket && withUnplaced(ungroupedBucket);
  // 見出しの下の一覧: グループ別ならグループなしのまとまり、まとめないなら all、作業場所別・状態順なら見出しのまとまりを中の段に持つ all
  const mainBucket: Bucket =
    ungrouped ?? (main[0]?.kind === "all" ? main[0] : { key: projectKey(projectId), kind: "all", label: "", chats: mainRows, drafts: [], counts: ZERO, children: main.map(withUnplaced) });
  const { before, after } = showGroups ? splitAtUngrouped(groups, (b) => b.group!.id, groupIds, ungroupedAt) : { before: groups, after: [] };
  const topDrafts = unplacedDrafts(topDraftList, draftsAfter);
  const shownPinnedDrafts = showDrafts ? pinnedDrafts : NO_DRAFTS;
  const tree: Bucket[] = [
    ...(waitingTop.length > 0 ? [{ key: `waiting:in:${projectId}`, kind: "waiting" as const, label: "要対応", chats: waitingTop, drafts: [], counts: ZERO }] : []),
    ...(topDrafts.length > 0 ? [{ key: `${projectKey(projectId)}/drafts`, kind: "all" as const, label: "", chats: [], drafts: topDrafts, counts: ZERO }] : []),
    ...(pinned || shownPinnedDrafts.length > 0
      ? [{ ...(pinned ?? { key: pinnedKey(projectId), kind: "pinned" as const, label: "固定", chats: [], counts: ZERO }), drafts: shownPinnedDrafts }]
      : []),
    ...before,
    mainBucket,
    ...after,
    ...buckets.filter((b) => b.kind === "archived"),
  ];

  // 見出しの下の一覧の空のとき（下書きは手動の並びで行の後ろに置いたものも数える）
  const mainDraftCount = main.reduce((count, b) => count + b.drafts.length, 0);
  const mainArchived = main.some((b) => b.archived);
  const restCount = visibleCount - (pinned?.chats.length ?? 0);
  const mainEmpty = (hidden: boolean): "start" | null | undefined => {
    const nothing = mainDraftCount === 0 && !mainArchived;
    if ((filtering && restCount === 0 && nothing) || (visibleCount === 0 && mainDraftCount === 0 && hidden)) return null;
    if (visibleCount === 0 && nothing) return "start";
    return mainRows.length === 0 && nothing ? null : undefined;
  };

  return {
    filter: { query, setQuery, keyword, stateFilter, setStateFilter, filtering, waitingOnly },
    /** 上から並ぶまとまり（BucketTree に渡す） */
    buckets: tree,
    counts: {
      /** アーカイブしていないチャットの数（絞り込む前。下書きも数える） */
      chats: chats.filter((c) => !c.archived_at).length + allDrafts.length,
      /** 絞り込んだあとのアーカイブしていないチャットの数（下書きは含めない） */
      visible: visibleCount,
      /** まとまりのキー → 下書きの数（手動の並びでチャットの行の後ろに置いたものも。見出しの数に足す） */
      drafts: draftCounts,
    },
    /** 手動の並びで、チャットの行のすぐ後ろに置く下書き（チャットの ID → 下書き） */
    draftsAfter,
    layout: {
      grouping,
      showGroups,
      mainKey: mainBucket.key,
      /** 「No Group」の見出しを出すか（グループに入れた下書きがあれば、グループなしのチャットがなくても下書きを戻す落とし先として出す） */
      ungroupedHead: showGroups && ungrouped !== undefined && (ungrouped.chats.length > 0 || ungrouped.drafts.length > 0 || groups.some((g) => g.drafts.length > 0) || Boolean(ungrouped.archived)),
      mainEmpty,
    },
  };
}

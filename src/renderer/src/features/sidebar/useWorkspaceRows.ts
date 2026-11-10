import { useMemo, useState } from "react";
import { boardColumnOf } from "@shared/chat/state";
import type { Chat } from "@shared/types";
import { useChatStates } from "@/app/chatStatesContext";
import { useChatSearch } from "@/features/chat/chatSearch";
import type { CountedColumn } from "@/features/chat/chatState";
import type { BucketHead } from "@/features/chatList/buckets";
import { useChatBuckets } from "@/features/chatList/useChatBuckets";
import { isWaitingState, useShowArchivedChats } from "@/features/chatList/chatListFlags";
import { useSetting } from "@/hooks/useSetting";
import { SIDEBAR_WAITING_ONLY } from "@/lib/storageKeys";
import { useWaitingView } from "./waitingView";
import type { PanelDraft } from "@/features/panel/state/panelDrafts";
import { useChatLayout } from "./chatGroupings";
import { sidebarLevels, sidebarSort } from "./sidebarChatOrder";
import { useProjectDrafts } from "./DraftRows";
import { unplacedDrafts, useDraftPlacement, type DraftSlot } from "./useDraftPlacement";

/** チャットのないグループも出す（グループなしは出すかを見出しの決まりで決めるので、いつも作っておく）。絞り込み中は一致するものだけ */
const KEEP_GROUPS = (head: BucketHead) => head.kind === "group" || head.kind === "ungrouped";
const KEEP_UNGROUPED = (head: BucketHead) => head.kind === "ungrouped";
const NO_DRAFTS: PanelDraft[] = [];
/** 見出しの下に並べるまとまり（固定・アーカイブ済み・自分で作ったグループ以外） */
const isMainBucket = (b: BucketHead) => b.kind !== "pinned" && b.kind !== "archived" && b.kind !== "group";

/**
 * サイドバーの 1 プロジェクトのチャットの行の絞り込みと分け方（分けるのは bucketChats）。
 * 検索（プロジェクトの検索欄か、すべてのプロジェクトをまたぐ検索欄 searchAll）・要対応・見出しの状態の数で絞り、
 * 上に固定したもの・グループごと・グループなし（まとめ方が作業場所・状態なら、その見出しのまとまり）・アーカイブ済みに分ける
 * （アーカイブ済みは、グループ別・作業場所別ならまとまりごとの archived、まとめないときはいちばん下の archived）
 */
export function useWorkspaceRows({
  projectId,
  chats,
  counted,
  groupCount,
  searchAll,
  collapsed,
}: {
  projectId: number;
  chats: Chat[];
  /** 要対応・状態ごとの数で数えるチャット（アーカイブしていないもの。子チャットも入れる）。要対応・状態で絞るときは、合う子チャットも行に出す */
  counted: Chat[];
  groupCount: number;
  searchAll: string;
  /** チャット一覧を閉じているか（閉じている間は、作業場所で分けるためのワークツリーの一覧を読みに行かない） */
  collapsed: boolean;
}) {
  // まとめ方（まとめない / グループ / 作業場所）と並び順（最近動いた順 / 状態順 / 手動）。グループの見出しは「グループ」のときだけ出す
  const { grouping, order } = useChatLayout();
  // 要対応（回答待ち・未読）だけを出すか（一覧の上の見出しの「要対応」の行で切り替え、表示が「プロジェクトで絞る」のときだけ絞る。
  // 「上にまとめる」では一覧はすべてを出し、待っているものは上のまとまりに出す）
  const [waitingOn] = useSetting(SIDEBAR_WAITING_ONLY);
  const [waitingView] = useWaitingView();
  const waitingOnly = waitingOn && waitingView === "filter";
  // アーカイブ済みのチャットを一覧の下に出すか（どのプロジェクトでも同じ）
  const [showArchived] = useShowArchivedChats();
  // プロジェクト内の検索: チャット名と、やり取りの中身（サーバーで全文検索）の両方で絞り込む
  const [query, setQuery] = useState("");
  const { keyword, matches } = useChatSearch(query || searchAll);
  // 見出しの状態の数を押して、その状態のチャットだけに絞る（このプロジェクトだけ。もう一度押すと戻す）
  const [stateFilter, setStateFilter] = useState<CountedColumn | null>(null);
  // 検索・要対応・状態で絞り込んでいる間は、まとまりを開いて見せ、空のまとまりは隠す
  const filtering = Boolean(keyword) || waitingOnly || stateFilter !== null;
  const { pending, stateOf } = useChatStates();
  // グループの見出しを出しているか（グループでまとめていて、グループがあるとき）
  const showGroups = grouping === "group" && groupCount > 0;
  // 送る前の新しいチャット（下書き）。グループの見出しを出しているときは作成先のグループの中（グループなし・もうないグループのものはグループなしの中）、
  // 出していないときはいちばん上に並べる。自分が続きを書くものなので「要対応」でも出す（検索・状態での絞り込み中は出さない）
  // ピン留めした下書きは、チャットと同じくいちばん上の「固定」に抜き出す（グループの中・いちばん上には出さない）
  const allDrafts = useProjectDrafts(projectId);
  const showDrafts = !keyword && stateFilter === null;
  const { drafts, pinnedDrafts } = useMemo(() => splitPinnedDrafts(allDrafts), [allDrafts]);

  // 出すチャット: アーカイブしていないものは検索・要対応・状態で絞り、アーカイブ済みは（出すときだけ）検索で絞る（要対応・状態で絞っているときは出さない。
  // 作業中・回答待ち・未読はアーカイブしていないチャットだけを数えるので、出すと数と合わず、絞り込み中はまとまりを開くので「アーカイブ済み」も開いて見えた。利用者の指摘）。
  // 行の分け方は、チャット・絞り込み・回答待ちの一覧が変わったときだけ計算し直す（matches は検索語が変わるまで同じ関数）
  // 要対応・状態で絞るときは、合う子チャットも行に並べる（親の中に閉じたままだと見えないため。数にも入れている。利用者の依頼）
  const shown = useMemo(() => {
    const fits = (chat: Chat) => {
      const state = stateOf(chat);
      return matches(chat) && (!waitingOnly || isWaitingState(state)) && (stateFilter === null || boardColumnOf(state) === stateFilter);
    };
    const top = chats.filter((chat) => (chat.archived_at ? showArchived && !waitingOnly && stateFilter === null && matches(chat) : fits(chat)));
    if (!waitingOnly && stateFilter === null) return top;
    const children = counted.filter((chat) => chat.parent_chat_id !== null && fits(chat));
    return children.length > 0 ? [...top, ...children] : top;
  }, [chats, counted, showArchived, waitingOnly, matches, stateOf, stateFilter]);
  const buckets = useChatBuckets(shown, {
    by: sidebarLevels(grouping, order),
    project: projectId,
    // 手動のときは、まとまりの中をドラッグで並べた順（Chat.position）
    sort: sidebarSort(order),
    pinned: true,
    // グループ別・作業場所別は、まとまりごとのいちばん下にそのまとまりのアーカイブ済み（bucket.archived）、まとめないときはいちばん下にまとめる
    archived: grouping === "none" ? "bucket" : "nested",
    drafts: showGroups && showDrafts ? drafts : NO_DRAFTS,
    keepEmpty: filtering ? KEEP_UNGROUPED : KEEP_GROUPS,
    idle: collapsed,
  });
  const main = buckets.filter(isMainBucket);
  const mainRows = useMemo(() => buckets.filter(isMainBucket).flatMap((b) => b.chats), [buckets]);

  // 手動の並びのときは、下書きの行をタブの列での位置に合わせてチャットの行の間に置く（利用者の依頼。置かないものは、いままでどおりまとまりのいちばん上）。
  // グループの見出しを出しているときは同じグループのチャットの間、出していないときは見出しの下の一覧（作業場所別なら同じ作業場所）のチャットの間
  const topDraftList = showDrafts && !showGroups ? drafts : NO_DRAFTS;
  const slots = useMemo<DraftSlot[]>(
    () =>
      showGroups
        ? buckets.filter((b) => b.drafts.length > 0).map((b) => ({ drafts: b.drafts, chats: b.chats }))
        : [{ drafts: topDraftList, chats: mainRows, match: grouping === "worktree" ? sameWorkplace : undefined }],
    [showGroups, buckets, topDraftList, mainRows, grouping],
  );
  const draftsAfter = useDraftPlacement(slots, chats, projectId, order === "manual" && !collapsed);
  const withUnplaced = <B extends { drafts: PanelDraft[] }>(b: B): B => {
    const rest = unplacedDrafts(b.drafts, draftsAfter);
    return rest === b.drafts ? b : { ...b, drafts: rest };
  };
  const draftCounts = useMemo(() => new Map(buckets.filter((b) => b.drafts.length > 0).map((b) => [b.key, b.drafts.length])), [buckets]);
  const ungroupedBucket = main.find((b) => b.kind === "ungrouped");
  const ungrouped = ungroupedBucket && withUnplaced(ungroupedBucket);

  return {
    grouping,
    showGroups,
    waitingOnly,
    query,
    setQuery,
    keyword,
    stateFilter,
    setStateFilter,
    filtering,
    pending,
    /** アーカイブしていないチャットの数（絞り込む前。固定したもの・送る前の新しいチャット（下書き）も数える。利用者の依頼で、下書きもやり取りのあるチャットと同じに数える） */
    chatCount: chats.filter((c) => !c.archived_at).length + allDrafts.length,
    /** 絞り込んだあとのアーカイブしていないチャットの数（下書きは含めない。空のときの案内を出すかに使う） */
    visibleCount: shown.filter((c) => !c.archived_at).length,
    /** 上に固定したもの（絞り込みを通したもの） */
    pinned: buckets.find((b) => b.kind === "pinned"),
    /** まとまり（グループ・グループなし）の中の下書きの数（まとまりのキー → 数。手動の並びでチャットの行の後ろに置いたものも数える。見出しの数に足す） */
    draftCounts,
    /** 自分で作ったグループ（グループでまとめているとき。チャットのないものも。絞り込み中は一致するもの・下書きのあるものだけ） */
    groups: buckets.filter((b) => b.kind === "group").map(withUnplaced),
    /** グループなし（グループでまとめているとき。もうないグループのものも含む） */
    ungrouped,
    /** 見出しの下に並べるチャット（グループでまとめているときはグループなしのもの、ほかは固定・アーカイブ済み以外のすべて） */
    mainRows,
    /** その見出しのまとまり（作業場所・状態。グループなしの中も状態順なら状態ごと）。見出しなしで並べるときは undefined */
    mainSections: ungrouped ? ungrouped.children : main[0]?.kind === "all" ? undefined : main,
    /** 検索に一致するアーカイブ済み（まとめないときだけ。いちばん下にまとめる。中は、ほかのチャットと同じまとめ方） */
    archived: buckets.find((b) => b.kind === "archived"),
    /** 見出しの下のまとまり（グループなし・作業場所）に、アーカイブ済みがあるか（グループ別・作業場所別。アーカイブ済みだけでも中身を出す） */
    mainArchived: main.some((b) => b.archived),
    /** グループの見出しを出していないときに、いちばん上に並べる下書き（グループに入れたものも含めて、すべて。手動の並びでチャットの行の後ろに置くものを除く） */
    topDrafts: unplacedDrafts(topDraftList, draftsAfter),
    /** 手動の並びで、チャットの行のすぐ後ろに置く下書き（チャットの ID → 下書き。タブの列での位置に合わせる） */
    draftsAfter,
    /** ピン留めした下書き（「固定」のチャットの上に並べる。検索・状態での絞り込み中は出さない） */
    pinnedDrafts: showDrafts ? pinnedDrafts : NO_DRAFTS,
  };
}

/** 作業場所別のとき、下書きと同じ作業場所のチャットか（下書きはワークツリーを選んでいなければ本体） */
const sameWorkplace = (chat: Chat, draft: PanelDraft) => (chat.worktree_path ?? null) === (draft.worktree ?? null);

/** 下書きを、ピン留めしていないもの・したものに分ける（どちらもなければ同じ空の配列） */
function splitPinnedDrafts(all: PanelDraft[]): { drafts: PanelDraft[]; pinnedDrafts: PanelDraft[] } {
  if (!all.some((d) => d.pinned)) return { drafts: all, pinnedDrafts: NO_DRAFTS };
  const drafts = all.filter((d) => !d.pinned);
  return { drafts: drafts.length === 0 ? NO_DRAFTS : drafts, pinnedDrafts: all.filter((d) => d.pinned) };
}

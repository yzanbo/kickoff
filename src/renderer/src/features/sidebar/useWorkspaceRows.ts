import { useMemo, useState } from "react";
import { boardColumnOf } from "@shared/chat/state";
import type { Chat } from "@shared/types";
import { useChatStates } from "@/app/chatStatesContext";
import { useChatSearch } from "@/features/chat/chatSearch";
import type { CountedColumn } from "@/features/chat/chatState";
import type { BucketBy, BucketHead } from "@/features/chatList/buckets";
import { useChatBuckets } from "@/features/chatList/useChatBuckets";
import { isWaitingState, useShowArchivedChats } from "@/features/chatList/chatListFlags";
import { useSetting } from "@/hooks/useSetting";
import { SIDEBAR_WAITING_ONLY } from "@/lib/storageKeys";
import { useWaitingView } from "./waitingView";
import type { PanelDraft } from "@/features/panel/state/panelDrafts";
import { useChatLayout, type ChatOrder } from "./chatGroupings";
import { useProjectDrafts } from "./DraftRows";
import type { ChatGrouping } from "@/features/chatList/chatGrouping";

/** サイドバーの段: まとめ方（グループ・作業場所）の中を、状態順なら状態ごとに分ける（まとめない × 最近動いた順は分けない） */
const levelsOf = (grouping: ChatGrouping, order: ChatOrder): BucketBy[] => [
  ...(grouping === "none" ? [] : [grouping]),
  ...(order === "status" ? (["status"] as const) : []),
];

/** チャットのないグループも出す（グループなしは出すかを見出しの決まりで決めるので、いつも作っておく）。絞り込み中は一致するものだけ */
const KEEP_GROUPS = (head: BucketHead) => head.kind === "group" || head.kind === "ungrouped";
const KEEP_UNGROUPED = (head: BucketHead) => head.kind === "ungrouped";
const NO_DRAFTS: PanelDraft[] = [];

/**
 * サイドバーの 1 プロジェクトのチャットの行の絞り込みと分け方（分けるのは bucketChats）。
 * 検索（プロジェクトの検索欄か、すべてのプロジェクトをまたぐ検索欄 searchAll）・自分待ち・見出しの状態の数で絞り、
 * 上に固定したもの・グループごと・グループなし（まとめ方が作業場所・状態なら、その見出しのまとまり）・アーカイブ済みに分ける
 * （アーカイブ済みは、グループ別・作業場所別ならまとまりごとの archived、まとめないときはいちばん下の archived）
 */
export function useWorkspaceRows({
  projectId,
  chats,
  groupCount,
  searchAll,
  collapsed,
}: {
  projectId: number;
  chats: Chat[];
  groupCount: number;
  searchAll: string;
  /** チャット一覧を閉じているか（閉じている間は、作業場所で分けるためのワークツリーの一覧を読みに行かない） */
  collapsed: boolean;
}) {
  // まとめ方（まとめない / グループ / 作業場所）と並び順（最近動いた順 / 状態順）。グループの見出しは「グループ」のときだけ出す
  const { grouping, order } = useChatLayout();
  // 自分待ち（回答待ち・未読）だけを出すか（上の行の「自分待ち」で切り替え、表示が「プロジェクトで絞る」のときだけ絞る。
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
  // 検索・自分待ち・状態で絞り込んでいる間は、まとまりを開いて見せ、空のまとまりは隠す
  const filtering = Boolean(keyword) || waitingOnly || stateFilter !== null;
  const { pending, stateOf } = useChatStates();
  // グループの見出しを出しているか（グループでまとめていて、グループがあるとき）
  const showGroups = grouping === "group" && groupCount > 0;
  // 送る前の新しいチャット（下書き）。グループの見出しを出しているときは作成先のグループの中（グループなし・もうないグループのものはグループなしの中）、
  // 出していないときはいちばん上に並べる。自分が続きを書くものなので「自分待ち」でも出す（検索・状態での絞り込み中は出さない）
  const drafts = useProjectDrafts(projectId);
  const showDrafts = !keyword && stateFilter === null;

  // 出すチャット: アーカイブしていないものは検索・自分待ち・状態で絞り、アーカイブ済みは（出すときだけ）検索で絞る（自分待ちのときは出さない）。
  // 行の分け方は、チャット・絞り込み・回答待ちの一覧が変わったときだけ計算し直す（matches は検索語が変わるまで同じ関数）
  const shown = useMemo(
    () =>
      chats.filter((chat) => {
        if (chat.archived_at) return showArchived && !waitingOnly && matches(chat);
        const state = stateOf(chat);
        return matches(chat) && (!waitingOnly || isWaitingState(state)) && (stateFilter === null || boardColumnOf(state) === stateFilter);
      }),
    [chats, showArchived, waitingOnly, matches, stateOf, stateFilter],
  );
  const buckets = useChatBuckets(shown, {
    by: levelsOf(grouping, order),
    project: projectId,
    pinned: true,
    // グループ別・作業場所別は、まとまりごとのいちばん下にそのまとまりのアーカイブ済み（bucket.archived）、まとめないときはいちばん下にまとめる
    archived: grouping === "none" ? "bucket" : "nested",
    drafts: showGroups && showDrafts ? drafts : NO_DRAFTS,
    keepEmpty: filtering ? KEEP_UNGROUPED : KEEP_GROUPS,
    idle: collapsed,
  });
  const main = buckets.filter((b) => b.kind !== "pinned" && b.kind !== "archived" && b.kind !== "group");
  const ungrouped = main.find((b) => b.kind === "ungrouped");

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
    /** アーカイブしていないチャットの数（絞り込む前 / 絞り込んだあと。固定したものも数える） */
    chatCount: chats.filter((c) => !c.archived_at).length,
    visibleCount: shown.filter((c) => !c.archived_at).length,
    /** 上に固定したもの（絞り込みを通したもの） */
    pinned: buckets.find((b) => b.kind === "pinned"),
    /** 自分で作ったグループ（グループでまとめているとき。チャットのないものも。絞り込み中は一致するもの・下書きのあるものだけ） */
    groups: buckets.filter((b) => b.kind === "group"),
    /** グループなし（グループでまとめているとき。もうないグループのものも含む） */
    ungrouped,
    /** 見出しの下に並べるチャット（グループでまとめているときはグループなしのもの、ほかは固定・アーカイブ済み以外のすべて） */
    mainRows: main.flatMap((b) => b.chats),
    /** その見出しのまとまり（作業場所・状態。グループなしの中も状態順なら状態ごと）。見出しなしで並べるときは undefined */
    mainSections: ungrouped ? ungrouped.children : main[0]?.kind === "all" ? undefined : main,
    /** 検索に一致するアーカイブ済み（まとめないときだけ。いちばん下にまとめる。中は、ほかのチャットと同じまとめ方） */
    archived: buckets.find((b) => b.kind === "archived"),
    /** 見出しの下のまとまり（グループなし・作業場所）に、アーカイブ済みがあるか（グループ別・作業場所別。アーカイブ済みだけでも中身を出す） */
    mainArchived: main.some((b) => b.archived),
    /** グループの見出しを出していないときに、いちばん上に並べる下書き（グループに入れたものも含めて、すべて） */
    topDrafts: showDrafts && !showGroups ? drafts : NO_DRAFTS,
  };
}

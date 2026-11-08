import type { Chat } from "@shared/types";
import { useFolds } from "@/hooks/useFold";
import type { PaneLeaf } from "@/features/panel/layout/paneTree";
import type { PanelController } from "@/features/panel/usePanel";
import { useManualChatReorder, useSidebarChatOrder } from "@/features/sidebar/sidebarChatOrder";
import { parsePanelKey } from "@/features/panel/surfaces";
import { OTHER_CLUSTER, clusterTabs, orderLikeSidebar, shownClusters, visibleClusterTabs, type TabCluster } from "./tabClusters";
import { useHiddenTabGroups } from "./useHiddenTabGroups";
import { useClusterReorder } from "./useClusterReorder";
import { useTabClusters, useTabGrouping } from "./useTabClusters";

/**
 * 1 つのペインのタブの並べ方: まとめ方（useTabGrouping。グループ別・作業場所別）を選んでいれば、まとまりごとに並べ替えて見せる
 * （ブラウザのタブのグループと同じ。まとまりの中はペインの並びのまま。ただし一覧のペインのチャットのタブはサイドバーと同じ並び = orderLikeSidebar）。display は見た目の並び（畳んだまとまりは表示中のタブだけ）。
 * home: 一覧のペイン（サイドバーと連動したチャットのタブが自動で入るペイン）だけ、タブのないグループの札・「チャット」の札を出し、札の数をサイドバーの数にする。
 * 分けたほかのペインは自分で置いたタブだけの列なので、札はタブのあるまとまりだけ・数はそのペインのタブの数。active はペインで見せている表示中のタブ
 */
export function useTabStrip(panel: PanelController, pane: PaneLeaf, home: boolean, active: string | null) {
  const showChat = panel.kinds.has("chat");
  const [grouping] = useTabGrouping(panel.surface);
  const { clusterOf, clusterOfChat, seeds, projectOrder, hueOf } = useTabClusters(panel, grouping);
  // 一覧のペインのチャットのタブは、サイドバーと同じ並び（まとめ方・並び順・固定・アーカイブ済み）にする（利用者の依頼）。
  // 自分で置いたタブだけの分けたペインは、ペインの並びのまま
  const scope = parsePanelKey(panel.key)?.scope;
  const sidebarOrder = useSidebarChatOrder(panel.chats, scope === "all" ? undefined : scope, showChat && home);
  const chatIdOf = (key: string) => {
    const t = panel.tabs.find((x) => x.key === key);
    return t?.kind === "chat" ? t.id : null;
  };
  // 欄で隠している種類のタブは並べない（閉じずに残す）。チャットを隠しているときは、タブのないグループの札も出さない
  const paneKnown = pane.tabs.filter(panel.isKindShown);
  const known = showChat && home ? orderLikeSidebar(paneKnown, chatIdOf, sidebarOrder.index) : paneKnown;
  // 分けたペイン（一覧のペインでない）は、タブのないまとまりの札を出さない
  const shownSeeds = showChat && home ? seeds : [];
  // チャットを隠している欄では、まとめ方のボタンも出さないので、まとめない（ターミナル・ブラウザのタブはそのまま並べる）
  const all = grouping === "none" || !showChat ? null : clusterTabs(known, clusterOf, shownSeeds, projectOrder);
  // そのまとまりに入るサイドバーのチャットの数（サイドバーの見出しと同じ数え方）
  const chatCount = (c: TabCluster) => panel.chats.filter((r) => clusterOfChat(r).key === c.key).length;
  // グループ別では、隠したグループ・チャットのないグループ（設定）を外す。隠したグループでも表示中のタブがあれば、畳んだ形で残す（forced）
  const hiddenGroups = useHiddenTabGroups();
  const shown =
    all && grouping === "group"
      ? shownClusters(all, { hiddenGroups: hiddenGroups.hidden, hideEmpty: hiddenGroups.hideEmpty, countOf: chatCount, active })
      : { clusters: all, forced: new Set<string>() };
  const clusters = shown.clusters;
  // タブを畳んだまとまり（まとまりのキーで覚え、すべてのパネル・ペインで共通）。畳んだまとまりは表示中のタブだけを見せ、display（見た目の並び）にも入れない。
  // アーカイブ済みのまとまりは、サイドバーと同じく初めは畳んでおく
  const folds = useFolds(
    "panel",
    (clusters ?? []).map((c) => c.key),
  );
  const openByDefault = (c: TabCluster) => c.kind !== "archived";
  const isCollapsed = (c: TabCluster) => shown.forced.has(c.key) || !folds.isOpen(c.key, openByDefault(c));
  /** タブの列から隠したグループか（表示中のタブがあるので、畳んだ形で残しているもの） */
  const isHidden = (c: TabCluster) => shown.forced.has(c.key);
  const shownTabs = (c: TabCluster) => visibleClusterTabs(c, isCollapsed(c), active);
  /** タブのチャット（チャットのタブのものだけ） */
  const chatsOf = (keys: readonly string[]) => keys.flatMap((key) => panel.chatOf(panel.tabs.find((x) => x.key === key)) ?? []);
  const display = clusters ? clusters.flatMap(shownTabs) : known;
  // 一覧のペインのチャットのタブのドラッグでの並べ替えは、サイドバーと同じ手動の並びとして保存する（利用者の依頼）
  const manual = useManualChatReorder(sidebarOrder);
  /**
   * 一覧のペインで、key のチャットのタブを見た目の並びの index 番目の前に落としたとき、手動の並びを変える（変えたら true）。
   * 落とした位置の右のタブ（なければ左のタブ）が同じまとまり（グループ・作業場所・固定・アーカイブ済み）のチャットなら、その前（後ろ）へ動かす
   */
  const reorderChatTab = (key: string, index: number): boolean => {
    if (!(showChat && home)) return false;
    const moved = chatIdOf(key);
    const chat = moved === null ? undefined : panel.chats.find((c) => c.id === moved);
    if (moved === null || !chat) return false;
    const neighbor = (k: string | undefined) => (k === undefined ? null : chatIdOf(k));
    const right = neighbor(display[index]);
    if (right !== null && right !== moved && manual.canMove(moved, right)) {
      manual.move(chat.project_id, moved, right, "before");
      return true;
    }
    const left = neighbor(display[index - 1]);
    if (left !== null && left !== moved && manual.canMove(moved, left)) {
      manual.move(chat.project_id, moved, left, "after");
      return true;
    }
    return false;
  };
  return {
    grouping,
    showChat,
    /** 見せる種類のタブ（ペインの並び） */
    known,
    /** まとまり（まとめないなら null） */
    clusters,
    /** 見た目の並び（ドラッグで落とす位置の印もこの並びで付ける） */
    display,
    reorderChatTab,
    isCollapsed,
    isHidden,
    // 隠したグループ（表示中のタブだけを残している）を開くときは、隠すのをやめる
    toggleCollapsed: (c: TabCluster) => (isHidden(c) && c.group ? hiddenGroups.toggle(c.group.id) : folds.toggle(c.key, openByDefault(c))),
    /** 自分で作ったグループを、タブの列から隠す・出す（グループ別のときだけ） */
    toggleHidden: grouping === "group" ? (c: TabCluster) => c.group && hiddenGroups.toggle(c.group.id) : undefined,
    shownTabs,
    /** まとまりの色（null は色なし）。サイドバーのまとまりと同じ色（プロジェクトごとに被らないよう決める。bucketHues.ts）。色を付けない設定なら、どれも null */
    hueOf,
    /** 自分で作ったグループの札のドラッグで、グループの並びを入れ替える（サイドバー・グループのボードも同じ並びになる） */
    reorder: useClusterReorder(clusters),
    /**
     * まとまり（グループ・作業場所）のチャット: タブで開いているチャットと、ボードの一覧のうち同じまとまりに入るもの（タブで開いていないものも）。
     * 「その他」はチャットが入らないので undefined（札を押せない）
     */
    clusterChats: (c: TabCluster): Chat[] | undefined => {
      if (c.key === OTHER_CLUSTER.key) return undefined;
      const open = chatsOf(c.tabs);
      return [...open, ...panel.chats.filter((r) => !open.some((o) => o.id === r.id) && clusterOfChat(r).key === c.key)];
    },
    /**
     * 札の右の数: 一覧のペインでは、サイドバーの見出しと同じく、そのまとまりに入るサイドバーのチャットの数（表示だけ消したタブも数え、下書き・ブラウザは数えない）。
     * 「その他」と分けたペインでは、そのペインのタブの数
     */
    clusterCount: (c: TabCluster) => (c.key === OTHER_CLUSTER.key || !home ? c.tabs.length : chatCount(c)),
    /**
     * まとめないときの「チャット」の札に出すチャット: タブで開いているチャットと、ボードの一覧のチャットすべて
     * （まとめているときと同じく、作業中・回答待ち・未読をひと目で分かるように。チャットが 1 つもなければ札を出さない）
     */
    allChats: (() => {
      if (clusters) return [];
      const open = chatsOf(known);
      return [...open, ...panel.chats.filter((r) => !open.some((o) => o.id === r.id))].filter((r) => !r.archived_at);
    })(),
  };
}

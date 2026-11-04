import type { Chat } from "@shared/types";
import { useFolds } from "@/hooks/useFold";
import type { PaneLeaf } from "@/features/panel/layout/paneTree";
import type { PanelController } from "@/features/panel/usePanel";
import { OTHER_CLUSTER, clusterHues, clusterTabs, visibleClusterTabs, type TabCluster } from "./tabClusters";
import { useClusterReorder } from "./useClusterReorder";
import { useTabClusters, useTabGrouping } from "./useTabClusters";

/**
 * 1 つのペインのタブの並べ方: まとめ方（useTabGrouping。グループ別・作業場所別）を選んでいれば、まとまりごとに並べ替えて見せる
 * （ブラウザのタブのグループと同じ。まとまりの中はペインの並びのまま）。display は見た目の並び（畳んだまとまりは表示中のタブだけ）。
 * home: 一覧のペイン（サイドバーと連動したチャットのタブが自動で入るペイン）だけ、タブのないグループの札・「チャット」の札を出し、札の数をサイドバーの数にする。
 * 分けたほかのペインは自分で置いたタブだけの列なので、札はタブのあるまとまりだけ・数はそのペインのタブの数。active はペインで見せている表示中のタブ
 */
export function useTabStrip(panel: PanelController, pane: PaneLeaf, home: boolean, active: string | null) {
  const showChat = panel.kinds.has("chat");
  const [grouping] = useTabGrouping(panel.surface);
  const { clusterOf, clusterOfChat, seeds, projectOrder } = useTabClusters(panel, grouping);
  // 欄で隠している種類のタブは並べない（閉じずに残す）。チャットを隠しているときは、タブのないグループの札も出さない
  const known = pane.tabs.filter(panel.isKindShown);
  // 分けたペイン（一覧のペインでない）は、タブのないまとまりの札を出さない
  const shownSeeds = showChat && home ? seeds : [];
  // チャットを隠している欄では、まとめ方のボタンも出さないので、まとめない（ターミナル・ブラウザのタブはそのまま並べる）
  const clusters = grouping === "none" || !showChat ? null : clusterTabs(known, clusterOf, shownSeeds, projectOrder);
  // タブを畳んだまとまり（まとまりのキーで覚え、すべてのパネル・ペインで共通）。畳んだまとまりは表示中のタブだけを見せ、display（見た目の並び）にも入れない。
  // アーカイブ済みのまとまりは、サイドバーと同じく初めは畳んでおく
  const folds = useFolds(
    "panel",
    (clusters ?? []).map((c) => c.key),
  );
  const openByDefault = (c: TabCluster) => c.kind !== "archived";
  const isCollapsed = (c: TabCluster) => !folds.isOpen(c.key, openByDefault(c));
  const shownTabs = (c: TabCluster) => visibleClusterTabs(c, isCollapsed(c), active);
  /** タブのチャット（チャットのタブのものだけ） */
  const chatsOf = (keys: readonly string[]) => keys.flatMap((key) => panel.chatOf(panel.tabs.find((x) => x.key === key)) ?? []);
  return {
    grouping,
    showChat,
    /** 見せる種類のタブ（ペインの並び） */
    known,
    /** まとまり（まとめないなら null） */
    clusters,
    /** 見た目の並び（ドラッグで落とす位置の印もこの並びで付ける） */
    display: clusters ? clusters.flatMap(shownTabs) : known,
    isCollapsed,
    toggleCollapsed: (c: TabCluster) => folds.toggle(c.key, openByDefault(c)),
    shownTabs,
    /** まとまりの色（同じ列のまとまりどうしで被らないように決める。グループは覚えた色を先に取る） */
    hues: clusterHues(clusters ?? []),
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
    clusterCount: (c: TabCluster) => (c.key === OTHER_CLUSTER.key || !home ? c.tabs.length : panel.chats.filter((r) => clusterOfChat(r).key === c.key).length),
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

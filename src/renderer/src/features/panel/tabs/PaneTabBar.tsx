import { Columns2, Rows2, X } from "lucide-react";
import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { cx } from "@/lib/cx";
import { IconButton } from "@/ui/IconButton";
import type { PaneLeaf, SplitDir } from "@/features/panel/layout/paneTree";
import type { useChatRename } from "@/features/chat/useChatRename";
import type { TabDrag } from "@/features/panel/layout/useTabDrag";
import { useGroupsOf } from "@/stores/groups";
import type { PanelController } from "@/features/panel/usePanel";
import { paneIndexOf } from "@/features/panel/clusters/tabClusters";
import { TabClusterHead } from "@/features/panel/clusters/TabClusterHead";
import { HiddenGroupItems } from "@/features/panel/clusters/HiddenGroupItems";
import { useTabStrip } from "@/features/panel/clusters/useTabStrip";
import { joinDropHandlers, useClusterTabDrop } from "@/features/panel/clusters/useClusterTabDrop";
import type { OpenWithKind } from "@/features/openWith/useOpenWithMenu";
import { PaneTab } from "./PaneTab";
import { PanelTabAdds } from "./PanelTabAdds";
import { specOf, type TabGroupLookup } from "./tabKinds";
import { SURFACES } from "@/features/panel/surfaces";
import { BucketColorItem } from "@/features/chatList/BucketColorItem";
import { PANEL_TAB_GROUP_COLORS, PANEL_TAB_HIDDEN } from "@/lib/storageKeys";
import { useSetting } from "@/hooks/useSetting";
import { tabFieldShown, type TabField } from "./tabFields";
import { AgentPanelAdds } from "@/features/panel/agents/AgentPanelAdds";

/**
 * パネルの 1 つのペインのタブの列。左にタブの列の道具（controls。左上のペインだけ）、タブ、
 * タブのすぐ右に新しいタブ（チャット・ブラウザ・ターミナル）、右端に右・下に分ける（欄の決まりで右だけ）・ペインを閉じる（分けているときだけ）と、
 * その後ろに endControls（右上のペインだけ。サブエージェントの欄の閉じるボタン）。
 * タブが多いときはタブの並びの中だけを横にスクロールし、新しいタブのボタンはいつもタブのすぐ右に見せる。
 * 押すとこのペインにピントを移す（新しく開くタブはここに入る）。
 * タブのまとめ方（グループ別・作業場所別）を選んでいるときは、まとまりごとに頭に名前を付けて並べる（並べ方は useTabStrip。
 * ブラウザのタブのグループと同じ。まとまりの中はペインの並びのまま。ドラッグで落とす位置は見た目の並びからペインの並びに直す）
 */
export function PaneTabBar({
  panel,
  pane,
  split,
  home,
  inert,
  controls,
  endControls,
  drag,
  terminals,
  terminalMenuOpen,
  onNewChat,
  onNewChild,
  onTerminal,
  onMenu,
  onBarMenu,
  onOpenWith,
  openWithShown,
  rename,
}: {
  panel: PanelController;
  pane: PaneLeaf;
  /** ペインを分けているか（ペインを閉じるボタンを出す） */
  split: boolean;
  /**
   * 一覧のペインか（サイドバーと連動して自動で足すチャットのタブが入るペイン）。一覧のペインだけ、タブのないグループの札・「チャット」の札を出し、
   * 札の数をサイドバーの数にする。分けたほかのペインは自分で置いたタブだけの列なので、札はタブのあるまとまりだけ・数はそのペインのタブの数
   */
  home: boolean;
  inert?: boolean;
  controls?: ReactNode;
  /** タブの列の右端（分ける・ペインを閉じるの後ろ）に置くもの（右上のペインだけ） */
  endControls?: ReactNode;
  drag: TabDrag;
  /** 開けるターミナルの場所の数（0 なら出さない） */
  terminals: number;
  terminalMenuOpen: boolean;
  onNewChat: () => void;
  /** 新しい子チャットを開く（サブエージェントの欄で、欄のチャットが子チャットを作れるときだけ。新しいタブのボタンの代わりに「＋」を出す） */
  onNewChild: (() => void) | null;
  onTerminal: (e: React.MouseEvent<HTMLButtonElement>, pane: PaneLeaf) => void;
  /** タブの右クリック */
  onMenu: (tabKey: string, e: React.MouseEvent) => void;
  /** ブラウザ・ターミナルの ▾（新しいタブ・外のアプリで開く・外のアプリを選ぶメニュー） */
  onOpenWith: (kind: OpenWithKind, e: React.MouseEvent<HTMLButtonElement>, pane: PaneLeaf) => void;
  /** いま開いている ▾ のメニュー（aria-expanded に使う） */
  openWithShown: OpenWithKind | null;
  /** タブの列の何もないところの右クリック（ボードの右のパネルだけ。見出しの置き方を選ぶ） */
  onBarMenu?: (e: React.MouseEvent) => void;
  /** チャットのタブの名前をその場で変える（ダブルクリック・右クリックの「名前を変更」。パネル全体で 1 つ） */
  rename: ReturnType<typeof useChatRename>;
}) {
  const insertAt = drag.insertAt(pane.id);
  // 見せている表示中のタブ（隠した種類のタブを表示中にしていたら、見せている種類の最初のタブ）
  const active = panel.shownTabOf(pane);
  const strip = useTabStrip(panel, pane, home, active);
  const { clusters, display } = strip;
  // グループ別のとき、チャットのタブをほかのグループのまとまり（No Group も）に落とすと、そのグループへ移す
  const tabDrop = useClusterTabDrop(panel, drag.dragging, strip.grouping === "group");
  // 表示中のタブが並びの外（横にスクロールした先）にあれば、見えるところまで動かす（新しく開いたタブなど）
  const stripRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    stripRef.current?.querySelector(".panel-tab.active")?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [active, pane.tabs.length]);
  /** 右・下に分ける: タブが 2 つ以上なら表示中のタブを新しいペインへ移し、1 つ以下なら空のペインを作る */
  const splitTo = (dir: SplitDir) => panel.splitPane(pane.id, dir, "after", pane.tabs.length > 1 ? (active ?? undefined) : undefined);
  // タブに添えるグループ名（タブのプロジェクトごとに 1 回だけ読む）
  const groupsOf = useGroupsOf(panel.tabs.flatMap((t) => specOf(t).projectOf(t) ?? []));
  const groupOf: TabGroupLookup = (projectId, groupId) => {
    const group = groupId === null || groupId === undefined ? undefined : groupsOf(projectId).find((g) => g.id === groupId);
    return group && { name: group.name, hue: group.hue };
  };
  // タブに出す項目（表示のメニューで選んだもの。まとめ方の項目はまとまりの札に出るので出さない）
  const [hiddenTabFields] = useSetting(PANEL_TAB_HIDDEN);
  const showField = (field: TabField) => tabFieldShown(field, hiddenTabFields, strip.grouping);
  /** タブ 1 つ（i は見た目の並びの位置。ドラッグで落とす位置の印もこの並びで付ける） */
  const tab = (key: string, i: number) => {
    const t = panel.tabs.find((x) => x.key === key);
    if (!t) return null;
    return (
      <PaneTab
        key={t.key}
        panel={panel}
        tab={t}
        active={active === t.key}
        home={home}
        show={showField}
        groupOf={groupOf}
        className={cx(
          insertAt === i && "split-insert-before",
          insertAt === display.length && i === display.length - 1 && "split-insert-after",
          drag.dragging === t.key && "split-dragging",
        )}
        extra={{ ...drag.tabProps(t.key), onContextMenu: (e) => onMenu(t.key, e) }}
        rename={rename}
      />
    );
  };
  return (
    <div
      className={cx("panel-tabs", insertAt !== null && pane.tabs.length === 0 && "split-insert-bar")}
      role="tablist"
      inert={inert}
      onPointerDown={() => panel.focusPane(pane.id)}
      onContextMenu={onBarMenu}
      {...drag.barProps(
        pane.id,
        (i) => paneIndexOf(i, display, pane.tabs),
        // 一覧のペインの中でのチャットのタブの並べ替えは、サイドバーの手動の並びを変える
        (key, i) => pane.tabs.includes(key) && strip.reorderChatTab(key, i),
      )}
    >
      {controls}
      {/* まとめないときは、タブの列の左端（横にスクロールしても動かない位置）に「チャット」の札 */}
      {!clusters && strip.showChat && home && strip.allChats.length > 0 && (
        <TabClusterHead
          cluster={{ key: "all", kind: "all", label: "チャット", title: "このパネルのチャット", tabs: strip.known }}
          chats={strip.allChats}
          onOpen={(chat) => panel.open(chat)}
          onStartNewChat={() => {
            panel.focusPane(pane.id);
            panel.startNewChat();
          }}
          all
          popoverTitle="状態ごとのチャット"
        />
      )}
      <div ref={stripRef} className={cx("panel-tab-strip", clusters && "grouped")}>
      {clusters
        ? clusters.map((c) => {
            // まとまりごとに 1 つの枠に入れ、色の付いた名前の札・薄い地・下の線で、どこからどこまでが 1 つのまとまりかを見せる（ブラウザのタブのグループと同じ）
            const hue = strip.hueOf(c);
            const collapsed = strip.isCollapsed(c);
            const shown = strip.shownTabs(c);
            return (
              <div
                key={c.key}
                className={cx("panel-tab-group", hue === null && "plain", collapsed && "collapsed", strip.reorder.classFor(c), tabDrop.classFor(c))}
                // --cluster-tabs: 見せているタブの数（まとまりをどこまで細くできるかを CSS で決める）
                style={{ ...(hue === null ? {} : { "--group-hue": hue }), "--cluster-tabs": shown.length } as CSSProperties}
                {...joinDropHandlers(strip.reorder.dropProps(c), tabDrop.dropProps(c))}
              >
                <TabClusterHead
                  cluster={c}
                  chats={strip.clusterChats(c)}
                  onOpen={(chat) => panel.open(chat)}
                  onNewChat={(target) => panel.openNew(target)}
                  collapsed={collapsed}
                  onToggleCollapsed={c.tabs.length > 0 ? () => strip.toggleCollapsed(c) : undefined}
                  dragProps={strip.reorder.handle(c)}
                  count={strip.clusterCount(c)}
                  tabCount={c.tabs.length}
                  hidden={strip.isHidden(c)}
                  onToggleHidden={strip.toggleHidden && c.group ? () => strip.toggleHidden?.(c) : undefined}
                  // 右クリックの下の項目: グループ別なら出すグループ（「表示」のメニューと同じ）、どちらのまとめ方でも「まとまりを色付きで表示」
                  menuExtra={
                    <>
                      {strip.grouping === "group" && <HiddenGroupItems panel={panel} />}
                      <BucketColorItem setting={PANEL_TAB_GROUP_COLORS} />
                    </>
                  }
                  canCreateGroup={strip.grouping === "group"}
                />
                {shown.map((key) => tab(key, display.indexOf(key)))}
              </div>
            );
          })
        : display.map(tab)}
      </div>
      {/* 新しいタブ: チャット・ブラウザ・ターミナルを 1 回で開く（タブのすぐ右。出す種類が決まっている欄（サブエージェントの欄）では出さない） */}
      {!SURFACES[panel.surface].fixedKinds && (
      <PanelTabAdds
        panel={panel}
        pane={pane}
        terminals={terminals}
        terminalMenuOpen={terminalMenuOpen}
        onNewChat={onNewChat}
        onTerminal={onTerminal}
        onOpenWith={onOpenWith}
        openWithShown={openWithShown}
      />
      )}
      {/* 新しい子チャット: 出す種類が決まっている欄（右の欄）の新しいタブのボタン。横の ▾ で、ほかに右の欄に開けるもの（子チャット・サブエージェント・ファイル・検索・変更・履歴・メモ）を選ぶ */}
      {onNewChild && <AgentPanelAdds panel={panel} onNewChild={onNewChild} />}
      {/* ペインを分ける・閉じる（右端。右の欄は分けるボタンを置かない noSplitButtons） */}
      <span className="panel-bar-buttons panel-pane-tools">
        {!SURFACES[panel.surface].noSplitButtons && (
          <>
            <IconButton icon={Columns2} label="右に分ける" title="右に分ける（⌘\）" size={14} onClick={() => splitTo("row")} />
            <IconButton icon={Rows2} label="下に分ける" size={14} onClick={() => splitTo("column")} />
          </>
        )}
        {split && <IconButton icon={X} label="ペインを閉じる" title="ペインを閉じる（チャットは一覧のペインに戻し、ほかのタブは閉じる）" size={15} onClick={() => panel.closePane(pane.id)} />}
        {endControls}
      </span>
    </div>
  );
}

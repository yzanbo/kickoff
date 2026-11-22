import type { CSSProperties } from "react";
import { cx } from "@/foundation/ui/lib/cx";
import { useSetting } from "@/foundation/ui/hooks/useSetting";
import { PANEL_TAB_GROUP_COLORS } from "@/foundation/ui/storage/storageKeys";
import { BucketColorItem } from "@/features/chatList/ui";
import { useGroupsOf } from "@/features/groups/ui";
import { chatTab, kindOf, openTab, panelSettings, type StripProps, type TabGroupLookup, type TabLook } from "@/features/panel/ui";
import { ClusterShortItem } from "./clusters/ClusterShortItem";
import { HiddenGroupItems } from "./clusters/HiddenGroupItems";
import { TabClusterHead } from "./clusters/TabClusterHead";
import { paneIndexOf } from "./clusters/tabClusters";
import { joinDropHandlers, useClusterTabDrop } from "./clusters/useClusterTabDrop";
import { useTabStrip } from "./clusters/useTabStrip";
import { ArchivedChatsItem } from "./tabs/ArchivedChatsItem";
import { tabFieldShown, type TabField } from "./tabs/tabFields";

/**
 * チャットのパネル・チャットの別ウィンドウ・チャットの画面の右の欄のタブの並べ方（欄の Strip）。
 * タブのまとめ方（グループ別・作業場所別）を選んでいるときは、まとまりごとに頭に名前を付けて並べる（並べ方は useTabStrip。
 * ブラウザのタブのグループと同じ。まとまりの中はペインの並びのまま。ドラッグで落とす位置は見た目の並びからペインの並びに直す）。
 * タブに出す項目（「表示」のメニューの「タブに出す項目」）とタブに添えるグループ名もここで決める
 */
export function ChatTabStrip({ panel, pane, home, dragging, renderTab, bar }: StripProps) {
  const active = pane.active;
  const strip = useTabStrip(panel, pane, home, active);
  const { clusters, display } = strip;
  // グループ別のとき、チャットのタブをほかのグループのまとまり（No Group も）に落とすと、そのグループへ移す
  const tabDrop = useClusterTabDrop(panel, dragging, strip.grouping === "group");
  // タブに添えるグループ名（タブのプロジェクトごとに 1 回だけ読む）
  const groupsOf = useGroupsOf(panel.tabs.flatMap((t) => kindOf(t).projectOf(t) ?? []));
  const groupOf: TabGroupLookup = (projectId, groupId) => {
    const group = groupId === null || groupId === undefined ? undefined : groupsOf(projectId).find((g) => g.id === groupId);
    return group && { name: group.name, hue: group.hue };
  };
  // タブに出す項目（表示のメニューで選んだもの。まとめ方の項目はまとまりの札に出るので出さない）
  const [hiddenTabFields] = useSetting(panelSettings.tabHidden);
  const look: TabLook = { show: (field) => tabFieldShown(field as TabField, hiddenTabFields, strip.grouping), groupOf };
  const tab = (key: string, i: number) => renderTab(key, i, display.length, look);
  // まとめないときは、タブの列の左端（横にスクロールしても動かない位置）に「チャット」の札
  const lead = !clusters && strip.showChat && home && strip.allChats.length > 0 && (
    <TabClusterHead
      cluster={{ key: "all", kind: "all", label: "チャット", title: "このパネルのチャット", tabs: strip.known }}
      chats={strip.allChats}
      onOpen={(chat) => openTab(panel.key, chatTab(chat))}
      all
      popoverTitle="状態ごとのチャット"
    />
  );
  return bar(
    clusters
      ? clusters.map((c) => {
          // まとまりごとに 1 つの枠に入れ、色の付いた名前の札・薄い地・下の線で、どこからどこまでが 1 つのまとまりかを見せる（ブラウザのタブのグループと同じ）
          const hue = strip.hueOf(c);
          const collapsed = strip.isCollapsed(c);
          const shown = strip.shownTabs(c);
          return (
            <div
              key={c.key}
              className={cx("panel-tab-group", hue === null && "plain", collapsed && "collapsed", tabDrop.classFor(c))}
              // --cluster-tabs: 見せているタブの数（まとまりをどこまで細くできるかを CSS で決める）
              style={{ ...(hue === null ? {} : { "--hue": hue }), "--cluster-tabs": shown.length } as CSSProperties}
              {...strip.reorder.attrsFor(c)}
              {...joinDropHandlers(strip.reorder.dropProps(c), tabDrop.dropProps(c))}
            >
              <TabClusterHead
                cluster={c}
                chats={strip.clusterChats(c)}
                onOpen={(chat) => openTab(panel.key, chatTab(chat))}
                collapsed={collapsed}
                onToggleCollapsed={c.tabs.length > 0 ? () => strip.toggleCollapsed(c) : undefined}
                dragProps={strip.reorder.handle(c)}
                count={strip.clusterCount(c)}
                tabCount={c.tabs.length}
                hidden={strip.isHidden(c)}
                onToggleHidden={strip.toggleHidden && c.group ? () => strip.toggleHidden?.(c) : undefined}
                // 右クリックの下の項目: グループ別なら出すグループ（「表示」のメニューと同じ）、どちらのまとめ方でも「まとまりを色付きで表示」「まとまりの名前を省略」「アーカイブ済みのチャットを表示」
                menuExtra={
                  <>
                    {strip.grouping === "group" && <HiddenGroupItems panel={panel} />}
                    <BucketColorItem setting={PANEL_TAB_GROUP_COLORS} />
                    <ClusterShortItem />
                    <ArchivedChatsItem />
                  </>
                }
                canCreateGroup={strip.grouping === "group"}
                // 右クリックのいちばん上の「新しいチャット」（このペインに、そのまとまりのグループ・作業場所で始める）
                onNewChat={
                  panel.kinds.has("chat")
                    ? (place) => {
                        panel.focusPane(pane.id);
                        panel.openNew(place);
                      }
                    : undefined
                }
              />
              {shown.map((key) => tab(key, display.indexOf(key)))}
            </div>
          );
        })
      : display.map(tab),
    {
      lead,
      grouped: clusters !== null,
      toPaneIndex: (i) => paneIndexOf(i, display, pane.tabs),
      // 一覧のペインの中でのチャットのタブの並べ替えは、サイドバーの手動の並びを変える
      reorder: (key, i, after) => pane.tabs.includes(key) && strip.reorderChatTab(key, i, after),
    },
  );
}

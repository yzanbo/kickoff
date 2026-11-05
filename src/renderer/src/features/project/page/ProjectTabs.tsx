import { Files, GitBranch, History, MessagesSquare, Search, SquareKanban, StickyNote, type LucideIcon } from "lucide-react";
import type { Chat } from "@shared/types";
import { useChatStates } from "@/app/chatStatesContext";
import { cx } from "@/lib/cx";
import { stateCounts } from "@/features/chat/chatState";
import { StateCornerCounts, stateCountsSummary } from "@/features/chatList/StateCornerCounts";
import { useSetting } from "@/hooks/useSetting";
import type { SettingValue } from "@/lib/storage";
import { href, type ProjectTab } from "@/app/router";
import { PROJECT_TABS_LAYOUT } from "@/lib/storageKeys";
import { useBoardColumns } from "@/features/board/BoardColumnsToggle";
import { ChoiceMenu } from "@/ui/ChoiceMenu";
import { useContextMenu } from "@/ui/useContextMenu";
import { MenuItem } from "@/ui/PopupMenu";
import { useChatPlacement } from "./chatPlacement";
import { useProjectTabOrder } from "./useProjectTabOrder";

/** タブの置き方（top = 見出しの下に横並び / side = 左に縦並び・アイコンだけ。縦の幅を本体に回せる） */
export type ProjectTabsLayout = SettingValue<typeof PROJECT_TABS_LAYOUT>;
/** 置き方の名前（設定の「表示」と、タブの右クリックのメニューで共通） */
export const PROJECT_TABS_LAYOUT_LABELS: Record<ProjectTabsLayout, string> = { top: "上に横並び", side: "左に縦並び（アイコン）" };

/** タブの置き方（設定の「表示」で選ぶ。どのプロジェクトでも同じ。初めは左に縦並び（選んだことがなければ、入れたばかりでも縦並び）） */
export function useProjectTabsLayout() {
  return useSetting(PROJECT_TABS_LAYOUT);
}

/** タブの数を取り直している最中か（ボード = チャットの一覧・変更 = Git の状態。数の代わりに更新中の印を出す） */
export interface TabRefreshing {
  chats: boolean;
  changes: boolean;
}

/** タブの列に出すタブ 1 つ */
interface TabSpec {
  tab: ProjectTab;
  label: string;
  icon: LucideIcon;
}

/**
 * タブの列に出すタブを、まとまりごとに（グループは「ボード」の中の列の切り替えにまとめたので出さない。チャットはボードと分ける置き方のときだけ）。
 * 同じまとまりのタブは薄い地でつなぎ、まとまりの間を空けて、どれが同じ仲間かを見て分かるようにする（タブが 1 つのまとまりは地を付けない）:
 * チャットの作業（ボード・チャット）/ コード（ファイル・検索・変更・履歴。どれも作業場所のコードと Git。以前の「エディタ」タブの中の切り替えと履歴）/ メモ。
 * ドラッグで並べ替えられる（ほかのまとまりへはまとまりごと、同じまとまりの中では 1 つずつ。useProjectTabOrder）
 */
const TAB_GROUPS: { key: string; label: string; tabs: TabSpec[] }[] = [
  {
    key: "work",
    label: "チャット",
    tabs: [
      { tab: "board", label: "ボード", icon: SquareKanban },
      { tab: "chats", label: "チャット", icon: MessagesSquare },
    ],
  },
  {
    key: "code",
    label: "コード",
    tabs: [
      { tab: "files", label: "ファイル", icon: Files },
      { tab: "search", label: "検索", icon: Search },
      { tab: "changes", label: "変更", icon: GitBranch },
      { tab: "history", label: "履歴", icon: History },
    ],
  },
  { key: "memos", label: "メモ", tabs: [{ tab: "memos", label: "メモ", icon: StickyNote }] },
];

/**
 * プロジェクトの画面のタブ（ボード・チャット（ボードと分ける置き方のとき）・ファイル・検索・変更・履歴・メモ）。チャットのタブ（ボードと分けない置き方ならボード）には状態ごとのチャット数（サイドバーのプロジェクトの丸と同じ StateCornerCounts。
 * 縦並びはアイコンの角に重ね（左上 = 作業中・右上 = 未読・左下 = 回答待ち）、横並びは名前の後ろに並べる。作業中のまま未読のものは未読に数えない）、
 * 変更には変更のあるファイルの数を添える。取り直している最中（refreshing）は、VS Code のバッジと同じく数の代わりに回る印を出す。
 * vertical: 左に縦並び（アイコンだけ。名前と数は title と aria-label）。右クリックで置き方（横並び / 縦並び）を切り替え、並べ替えていれば元の並びに戻せる
 */
export function ProjectTabs({
  projectId,
  tab,
  chats,
  changeCount,
  refreshing,
  vertical = false,
}: {
  projectId: number;
  tab: ProjectTab;
  chats: Chat[];
  changeCount: number;
  refreshing: TabRefreshing;
  vertical?: boolean;
}) {
  const [columns] = useBoardColumns();
  const [layout, setLayout] = useProjectTabsLayout();
  const [placement] = useChatPlacement();
  const menu = useContextMenu();
  // ドラッグでの並べ替え（並べた順のまとまりとタブ）
  const order = useProjectTabOrder(TAB_GROUPS, vertical);
  // 状態ごとのチャット数（カンバンの列と同じ数え方。アーカイブ済みは数えない）
  const { pending } = useChatStates();
  const counts = stateCounts(chats, pending);
  const countsText = stateCountsSummary(counts);
  // チャットの数を添えるタブ（チャットをボードと分けるならチャットのタブ、分けないならボード。チャットを開く所に付ける）
  const chatsTab: ProjectTab = placement === "separate" ? "chats" : "board";
  return (
    <nav
      className={cx("tabs", vertical && "project-side-tabs")}
      role="tablist"
      aria-orientation={vertical ? "vertical" : undefined}
      onContextMenu={menu.open}
    >
      {order.groups.map((group) => {
        const shown = group.tabs.filter((t) => t.tab !== "chats" || placement === "separate");
        return (
          <div
            key={group.key}
            className={cx("project-tab-group", shown.length > 1 && "boxed", order.groupClass(group))}
            aria-label={group.label}
            {...order.groupProps(group)}
          >
            {shown.map(({ tab: t, label, icon: Icon }) => {
              // ボードのタブは、列が状態でもグループでも選んだ状態にし、押したら最後に見た列の分け方で開く
              const selected = tab === t || (t === "board" && tab === "groups");
              const target: ProjectTab = t === "board" && columns === "groups" ? "groups" : t;
              // 数はチャットのタブ（状態ごとのチャット）と変更（変更のあるファイル）だけ。ほかには出さない
              const count = t === chatsTab ? (countsText ? 1 : 0) : t === "changes" ? changeCount : 0;
              const countLabel = t === chatsTab ? countsText : `変更のあるファイル ${count} 件`;
              return (
                <a
                  key={t}
                  role="tab"
                  aria-selected={selected}
                  aria-label={vertical ? `${label}${count > 0 ? `（${countLabel}）` : ""}` : undefined}
                  title={vertical ? `${label}${count > 0 ? `（${countLabel}）` : ""}` : t === chatsTab && count > 0 ? countLabel : undefined}
                  className={cx("tab", selected && "active", order.tabClass(t))}
                  href={href({ name: "project", id: projectId, tab: target })}
                  {...order.tabProps(group, t)}
                >
                  {vertical ? <Icon size={18} aria-hidden /> : label}
                  {/* 取り直している最中は数の代わりに更新中の印（終わったら数に戻す） */}
                  {(t === chatsTab && refreshing.chats) || (t === "changes" && refreshing.changes) ? (
                    <span className="tab-refreshing" role="status" aria-label="更新中" title="更新中…">
                      <span className="spinner" aria-hidden />
                    </span>
                  ) : t === chatsTab ? (
                    <StateCornerCounts counts={counts} inline={!vertical} />
                  ) : (
                    t === "changes" &&
                    count > 0 && (
                      <span className="change-count" aria-label={vertical ? undefined : countLabel}>
                        {count}
                      </span>
                    )
                  )}
                </a>
              );
            })}
          </div>
        );
      })}
      {menu.menu && (
        <ChoiceMenu
          at={menu.menu.at}
          title="タブの置き方"
          values={PROJECT_TABS_LAYOUT.choices}
          labels={PROJECT_TABS_LAYOUT_LABELS}
          value={layout}
          onPick={setLayout}
          onClose={menu.close}
        >
          {order.customized && <MenuItem onSelect={order.reset}>タブの並びを元に戻す</MenuItem>}
        </ChoiceMenu>
      )}
    </nav>
  );
}

import type { ReactNode } from "react";
import { usePopover } from "@/ui/Popover";
import type { Chat } from "@shared/types";
import { api } from "@/api";
import { useChatStates } from "@/app/chatStatesContext";
import { promptDialog, reportFailure } from "@/ui/dialogs";
import { confirmDeleteGroup } from "@/features/group/groups";
import { MenuItem, PopupMenu } from "@/ui/PopupMenu";
import { useContextMenu } from "@/ui/useContextMenu";
import { cx } from "@/lib/cx";
import { ChevronLeft } from "lucide-react";
import { stateCounts } from "@/features/chat/chatState";
import { StateCornerCounts, stateCountsSummary } from "@/features/chatList/StateCornerCounts";
import { StateChatsPopover, chatsByState } from "@/features/chatList/StateChatsPopover";
import type { TabCluster } from "./tabClusters";
import type { NewChatTarget } from "@/features/panel/usePanel";
import { NO_GROUP_LABEL } from "@/features/chat/chatTitle";

/**
 * タブのまとまりの頭（まとまりの色の名前の札と、中のタブの数）。札の角に、そのまとまり（グループ・作業場所）のチャットの状態ごとの数を重ね、
 * 札を押すと、まとまりのチャットを状態ごと（作業中 → 回答待ち → 未読）にまとめた一覧を開く（画面の見出しの状態ごとの数と同じ一覧。行でそのチャットのタブを開く）。
 * runs が undefined の「その他」（ブラウザなど）は押せない札。まとまりはプロジェクトごとなので、一覧の行にプロジェクト名は出さない。
 * まとめないときも、タブの列の左端に「チャット」の札（all）として置き、パネルのチャット全体の状態ごとの数と一覧を出す（タブの数は出さない）。
 * 札の右クリック（プロジェクトの分かるまとまりだけ）: 新しいグループを作成（グループ別のときだけ。作業場所別の札はグループと関係がないので出さない）・
 * このグループをタブの列から隠す・表示する（自分で作ったグループのとき。useHiddenTabGroups）・表示するグループ / チャットのないグループを隠す（グループ別のとき）と
 * まとまりを色付きで表示（menuExtra）・このグループを削除（自分で作ったグループのとき。サイドバーと同じく確かめてから。中のチャットはグループなしに戻る）。
 * 自分で作ったグループの札はつかんで並べ替えられる（dragProps。サイドバーのグループの並びも同じに変わる）。
 * 札は左右 2 つに区切った 1 つの丸い札: 左 = 名前（押すと一覧）、右 = タブを畳む・開く（onToggleCollapsed。ブラウザのタブのグループを畳むのと同じ。右クリックにも同じ項目）。
 * 右側は、開いているときは「‹」（札へ畳む向き）、畳んでいるときは「3」（まとまりのタブの数 tabCount。表示中のタブを残しているかに関係なく同じ形。
 * 以前は「+3」（隠れているタブの数）と、隠れたものがないときの「›」を使い分けていたが、選んでいるかで形が変わり、
 * 「+」は表示中のタブを残しているときに「ほかにもある」と読めて合わなかった）。
 * 以前は札の外に「› 3 / ⌄ 3」（矢印とチャットの数）を置いていて、横に並ぶ列では向きが開閉に結びつかず、角の状態ごとの数とも数字が並んで分かりにくかった。
 * count はサイドバーの見出しと同じ数え方のチャットの数（表示だけ消したタブ・下書きは数えない。札の説明に出す）
 */
export function TabClusterHead({
  cluster,
  chats,
  onOpen,
  onNewChat,
  onStartNewChat,
  all = false,
  popoverTitle = `${cluster.label}のチャット`,
  collapsed = false,
  onToggleCollapsed,
  dragProps,
  count = cluster.tabs.length,
  tabCount = cluster.tabs.length,
  hidden = false,
  onToggleHidden,
  menuExtra,
  canCreateGroup = false,
}: {
  cluster: TabCluster;
  chats: Chat[] | undefined;
  onOpen: (chat: Chat) => void;
  /** 札の右クリック・一覧の「このグループ（作業場所）で新しいチャット」 */
  onNewChat?: (target: NewChatTarget) => void;
  /** 「チャット」の札（まとめないとき）の一覧の「新しいチャット」（欄が決めた作成先で始める） */
  onStartNewChat?: () => void;
  all?: boolean;
  popoverTitle?: string;
  /** まとまりのタブを畳んでいるか（表示中のタブだけを残す） */
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
  /** 札をつかんでグループの並びを入れ替える（自分で作ったグループだけ。useClusterReorder の handle） */
  dragProps?: { draggable: boolean; onDragStart: (e: React.DragEvent) => void; onDragEnd: () => void };
  /** 札の説明に出す数（サイドバーの見出しと同じ、まとまりのチャットの数） */
  count?: number;
  /** まとまりのタブの数（畳んだときに札の右側に出す。表示中のタブも数える） */
  tabCount?: number;
  /** タブの列から隠したグループか（表示中のタブがあるので、畳んだ形で残している） */
  hidden?: boolean;
  /** 自分で作ったグループを、タブの列から隠す・出す（グループ別のとき。右クリックの項目） */
  onToggleHidden?: () => void;
  /** 右クリックのメニューの下に足す項目（グループ別のときの「表示するグループ」「チャットのないグループを隠す」） */
  menuExtra?: ReactNode;
  /** 右クリックに「新しいグループを作成…」を出す（グループ別のときだけ。作業場所別の本体・ブランチの札では出さない） */
  canCreateGroup?: boolean;
}) {
  const { pending } = useChatStates();
  // 札を押すと開く、まとまりのチャットの一覧（札の下に出す。タブの列に切り取られないよう top layer に出る）
  const popover = usePopover<HTMLSpanElement>();
  // 札の右クリックのメニュー（プロジェクトの分かるまとまりだけ。「その他」「チャット」の札では出さない）
  const menu = useContextMenu();
  const projectId = cluster.projectId;
  // 右クリックに出す項目があるか（作業場所別でタブのない札は何も出さない）
  const hasMenu = (onToggleCollapsed && cluster.tabs.length > 0) || canCreateGroup || Boolean(cluster.group) || Boolean(menuExtra);
  const openMenu = (e: React.MouseEvent) => {
    if (projectId === undefined || !hasMenu) return;
    // タブの列の何もないところの右クリック（「表示」のメニュー）に渡さない
    e.stopPropagation();
    menu.open(e);
  };
  const createGroup = async () => {
    if (projectId === undefined) return;
    const name = await promptDialog({ title: "新しいグループ", label: "グループ名", placeholder: "例: コードレビュー", confirmLabel: "作成" });
    if (name?.trim()) await api.createGroup(projectId, name.trim()).catch(reportFailure("グループを作成できませんでした"));
  };
  // 自分で作ったグループの札（グループ別のとき）か、グループなしの札か
  const group = cluster.group;
  const byGroup = cluster.kind === "group" || cluster.kind === "ungrouped";
  const deleteGroup = async () => {
    if (!group) return;
    if (await confirmDeleteGroup({ name: group.name })) await api.deleteGroup(group.id).catch(reportFailure("グループを削除できませんでした"));
  };
  const counts = chats ? stateCounts(chats, pending) : undefined;
  // このまとまりで始める新しいチャット: グループ別はそのグループ（グループなしならグループを付けない）、作業場所別は本体・そのワークツリー
  // （フォルダが見つからない・以前のブランチのまとまりは、そこでは始められないので出さない）
  const place = cluster.kind === "worktree" ? cluster.place : undefined;
  const placeTarget = place?.kind === "main" ? {} : place?.kind === "worktree" ? { worktree: place.key } : undefined;
  const newChatTarget =
    projectId === undefined || !onNewChat ? undefined : byGroup ? { projectId, group: group?.id } : placeTarget ? { projectId, ...placeTarget } : undefined;
  const newChatLabel = byGroup
    ? group
      ? `「${group.name}」で新しいチャット`
      : `${NO_GROUP_LABEL} で新しいチャット`
    : place?.kind === "worktree"
      ? `「${place.name}」で新しいチャット`
      : "本体で新しいチャット";
  // 一覧の下の「新しいチャット」（まとまりのものか、「チャット」の札なら欄が決めた作成先）
  const listNewChat = newChatTarget
    ? { label: newChatLabel, onSelect: () => onNewChat?.(newChatTarget) }
    : onStartNewChat
      ? { label: "新しいチャット", onSelect: onStartNewChat }
      : undefined;
  const countTitle = chats ? `チャット ${count} 件（サイドバーの見出しと同じ数）` : `タブ ${count} 個`;
  const summary = counts ? stateCountsSummary(counts) : "";
  const title = summary ? `${cluster.title ?? cluster.label}（${summary}）` : cluster.title;
  const nameText = <span className="panel-tab-cluster-text">{cluster.label}</span>;
  return (
    <span ref={popover.anchor} className={cx("panel-tab-cluster", all && "all", dragProps && "draggable")} onContextMenu={openMenu} {...dragProps}>
      {/* 1 つの丸い札を左右に区切る: 左 = 名前（押すと一覧）・右 = 畳む / 開く。角の状態ごとの数は札全体の角に重ねる */}
      <span className={cx("panel-tab-cluster-pill", collapsed && "collapsed")}>
        {chats ? (
          <button type="button" className="panel-tab-cluster-name" title={`${title ?? cluster.label}・${countTitle}。押すと状態ごとのチャットを一覧する`} aria-expanded={popover.open} onClick={popover.toggle}>
            {nameText}
          </button>
        ) : (
          <span className="panel-tab-cluster-name" title={title}>
            {nameText}
          </span>
        )}
        {!all && onToggleCollapsed && (
          <button
            type="button"
            className="panel-tab-cluster-fold"
            aria-expanded={!collapsed}
            aria-label={hidden ? "タブの列に表示する（隠しているグループ）" : collapsed ? `タブを表示する（${tabCount} 個のタブを畳んでいます）` : "タブを畳む"}
            title={
              hidden
                ? "タブの列から隠しているグループです（表示中のタブだけを出しています）。押すとタブの列に戻します"
                : collapsed
                  ? `タブを表示する（${tabCount} 個のタブを畳んでいます）`
                  : "タブを畳む（表示中のタブは残す）"
            }
            onClick={onToggleCollapsed}
          >
            {collapsed ? tabCount : <ChevronLeft size={12} aria-hidden />}
          </button>
        )}
        {counts && <StateCornerCounts counts={counts} />}
      </span>
      {menu.menu && projectId !== undefined && (
        <PopupMenu at={menu.menu.at} label={`「${cluster.label}」の操作`} onClose={menu.close}>
          {onToggleCollapsed && cluster.tabs.length > 0 && (
            <>
              <MenuItem onSelect={onToggleCollapsed}>{collapsed ? "タブを表示する" : "タブを畳む"}</MenuItem>
              {(canCreateGroup || cluster.group || menuExtra) && <div className="menu-separator" role="separator" />}
            </>
          )}
          {canCreateGroup && (
            <MenuItem onSelect={() => void createGroup()} title="このプロジェクトに、自分で使うグループを作ります">
              新しいグループを作成…
            </MenuItem>
          )}
          {group && onToggleHidden && (
            <MenuItem
              onSelect={onToggleHidden}
              title={hidden ? "このグループの札とタブを、タブの列に戻します" : "このグループの札とタブを、タブの列に出さないようにします（チャットはそのまま。タブの列の「表示」から戻せます）"}
            >
              {hidden ? `「${group.name}」をタブの列に表示する` : `「${group.name}」をタブの列から隠す`}
            </MenuItem>
          )}
          {menuExtra && (
            <>
              {(canCreateGroup || (group && onToggleHidden)) && <div className="menu-separator" role="separator" />}
              {menuExtra}
            </>
          )}
          {group && (
            <>
              <div className="menu-separator" role="separator" />
              <MenuItem danger onSelect={() => void deleteGroup()} title={`グループを消します（中のチャットは消えず、「${NO_GROUP_LABEL}」に戻ります）`}>
                「{group.name}」を削除…
              </MenuItem>
            </>
          )}
        </PopupMenu>
      )}
      {popover.open && chats && (
        <StateChatsPopover
          title={popoverTitle}
          anchor={popover.anchor}
          // まとまりのチャットをすべて（既読・アーカイブ済みも）状態ごとに並べる
          sections={chatsByState(chats, pending, { all: true })}
          emptyText="チャットはありません"
          // まとまり（グループ・作業場所）では、そこに new チャットを足すボタンも置く（札の右クリックの項目と同じ）。「チャット」の札は欄の作成先で
          newChat={listNewChat}
          onOpen={onOpen}
          onClose={popover.close}
          className="cluster-chats-popover"
        />
      )}
    </span>
  );
}

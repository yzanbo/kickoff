import { AppWindow, ArrowRightLeft, Columns2, GitBranch, MessageSquare, Rows2, SquarePen, Undo2, X } from "lucide-react";
import { alertDialog } from "@/ui/dialogs";
import { ChatMenuItems } from "@/features/chat/ChatMenuItems";
import { DraftMenuItems } from "@/features/chat/DraftMenuItems";
import { draftOfPanelTab } from "@/features/panel/state/panelDrafts";
import { chatPaneAt, chatPaneSlot } from "@/features/chat/pane/chatPaneContext";
import type { Placement } from "@/lib/floating";
import { MenuItem, PopupMenu } from "@/ui/PopupMenu";
import { homePane, leavesOf, paneOfTab } from "@/features/panel/layout/paneTree";
import type { PanelController } from "@/features/panel/usePanel";
import type { NewChatTarget } from "./panelTypes";
import { canPopOut, popOutTab } from "./popOutTab";

/**
 * 右のパネルのタブの右クリックのメニュー: いちばん上に「新しいチャット」（チャットを出す欄だけ。利用者の依頼。右クリックしたタブのペインに、
 * チャット・新しいチャットのタブなら同じグループ・作業場所で、ほかのタブなら欄の作成先で始める）、右・下に分けて開く、ほかのペインへ移す（ペインが 2 つ以上のとき。ペインは並び順の番号で呼び、
 * 一覧のペインに「（一覧）」と添える）、分けたペインのサイドバーと連動したチャットは一覧のペインに戻す、閉じる。
 * チャットのタブには、会話 / 動きの切り替え（見出しの行を隠していても切り替えられるように）と、サイドバーの行と同じチャットの項目
 * （名前を変更・既読 / 未読・固定・セッション ID をコピー・プロジェクトを移動・アーカイブ・削除）も並べる。
 * 送る前の新しいチャットのタブは、サイドバーの下書きの行と同じ項目（DraftMenuItems。チャットの項目のうち下書きでもできるもの）を同じ並びで
 */
export function TabMenu({
  panel,
  tabKey,
  at,
  onRename,
  onClose,
}: {
  panel: PanelController;
  tabKey: string;
  /** 置く場所（右クリックの位置） */
  at: Placement;
  /** チャット・新しいチャットのタブの名前をその場で変え始める */
  onRename: () => void;
  onClose: () => void;
}) {
  const pane = paneOfTab(panel.layout, tabKey);
  if (!pane) return null;
  const panes = leavesOf(panel.layout.root);
  const tab = panel.tabs.find((t) => t.key === tabKey);
  // ボードの一覧にあればそれを、なければタブの中のチャットから届いたもの（まだ読み込んでいなければチャットの項目は出さない）
  const chat = panel.chatOf(tab);
  // 一覧のペインはサイドバーと連動したチャットが入るペインなので、チャットを出す欄だけで「（一覧）」と添える
  const homeId = panes.length > 1 && panel.kinds.has("chat") ? homePane(panel.layout).id : undefined;
  // 分けたペインにある、サイドバーと連動したチャット（× と同じく、一覧のペインへ戻せる）
  const canReturn = homeId !== undefined && pane.id !== homeId && panel.isLinkedTab(tabKey);
  // そのタブで描いているチャットの画面（会話 / 動きを切り替える。描いていなければ出さない）
  const chatPane = chat ? chatPaneAt(chatPaneSlot(panel.key, tabKey)) : undefined;
  const activity = chatPane?.state.get().showing === "activity";
  // 右クリックしたタブのペインに開く（チャット・新しいチャットのタブは、いちばん上の「新しいチャット」から同じグループ・作業場所で。ほかは欄の作成先）
  const startNew = (target: NewChatTarget | undefined) => {
    panel.focusPane(pane.id);
    if (target) panel.openNew(target);
    else panel.startNewChat();
  };
  // チャットでないタブの「新しいチャット」（欄の作成先で始める）
  const newChatItem = panel.kinds.has("chat") && (
    <>
      <MenuItem title="このペインで新しいチャットを始める" onSelect={() => startNew(undefined)}>
        <SquarePen size={14} /> 新しいチャット
      </MenuItem>
      <div className="menu-separator" role="separator" />
    </>
  );
  const showItem = chatPane && (
    <MenuItem
      onSelect={() => {
        panel.showTab(tabKey);
        chatPane.show(activity ? "conversation" : "activity");
      }}
    >
      {activity ? <MessageSquare size={14} /> : <GitBranch size={14} />} {activity ? "会話に戻る" : "動きを見る"}
    </MenuItem>
  );
  const paneItems = (
    <>
      <MenuItem onSelect={() => panel.splitPane(pane.id, "row", "after", tabKey)}>
        <Columns2 size={14} /> 右に分けて開く
      </MenuItem>
      <MenuItem onSelect={() => panel.splitPane(pane.id, "column", "after", tabKey)}>
        <Rows2 size={14} /> 下に分けて開く
      </MenuItem>
      {panes.length > 1 &&
        panes.map((p, i) =>
          p.id === pane.id ? null : (
            <MenuItem key={p.id} onSelect={() => panel.moveTab(tabKey, p.id)}>
              <ArrowRightLeft size={14} /> {`ペイン ${i + 1}${p.id === homeId ? "（一覧）" : " "}へ移す`}
            </MenuItem>
          ),
        )}
    </>
  );
  const closeItem = (
    <>
      {/* チャットの画面の右の欄のサブエージェント・変更・ファイルは、別ウィンドウへ移せる（2 枚目の画面に置くなど） */}
      {canPopOut(tab) && (
        <MenuItem onSelect={() => popOutTab(panel, tabKey)}>
          <AppWindow size={14} /> 別ウィンドウで開く
        </MenuItem>
      )}
      {canReturn && (
        <MenuItem onSelect={() => panel.returnToHome(tabKey)}>
          <Undo2 size={14} /> 一覧のペインに戻す
        </MenuItem>
      )}
      {/* メニューの「閉じる」は聞かずに閉じる（× と違い、アーカイブ・削除はこのメニューの項目で選べる） */}
      <MenuItem onSelect={() => panel.closeTab(tabKey)}>
        <X size={14} /> タブを閉じる
      </MenuItem>
    </>
  );
  const draft = draftOfPanelTab(panel.key, tab);
  return (
    <PopupMenu at={at} label="タブのメニュー" onClose={onClose}>
      {draft ? (
        <DraftMenuItems
          draft={draft}
          onNewChat={panel.kinds.has("chat") ? (place) => startNew(place) : undefined}
          onRename={onRename}
          onClose={onClose}
          before={paneItems}
          after={
            <>
              <div className="menu-separator" role="separator" />
              {closeItem}
            </>
          }
        />
      ) : chat ? (
        <ChatMenuItems
          chat={chat}
          onRename={onRename}
          onClose={onClose}
          onError={(m) => void alertDialog("操作できませんでした", m)}
          onNewChat={panel.kinds.has("chat") ? (place) => startNew(place) : undefined}
          before={
            <>
              {showItem}
              {showItem && <div className="menu-separator" role="separator" />}
              {paneItems}
            </>
          }
          after={
            <>
              <div className="menu-separator" role="separator" />
              {closeItem}
            </>
          }
        />
      ) : (
        <>
          {newChatItem}
          {paneItems}
          {closeItem}
        </>
      )}
    </PopupMenu>
  );
}

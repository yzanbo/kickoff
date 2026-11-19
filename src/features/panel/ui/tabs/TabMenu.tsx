import { AppWindow, ArrowRightLeft, Columns2, GitBranch, MessageSquare, Pencil, Rows2, SquarePen, Undo2, X } from "lucide-react";
import { useKnownChat } from "@/features/chat/ui/store/knownChats";
import { alertDialog } from "@/foundation/ui/kit/dialogs";
import { ChatMenuItems } from "@/features/chatList/ui/menu/ChatMenuItems";
import { DraftMenuItems } from "@/features/chatPanel/ui/drafts/DraftMenuItems";
import { draftOfPanelTab } from "@/features/chatPanel/ui/drafts/panelDrafts";
import { chatPaneAt, chatPaneSlot } from "@/features/chat/ui/screen/ports";
import type { Placement } from "@/foundation/ui/lib/floating";
import { MenuItem, PopupMenu } from "@/foundation/ui/kit/PopupMenu";
import { homePane, leavesOf, paneOfTab } from "@/features/panel/ui/layout/paneTree";
import type { PanelController } from "@/features/panel/ui/usePanel";
import type { NewChatTarget } from "./panelTypes";
import { confirmCloseUnsaved } from "./confirmUnsaved";
import { canPopOut, popOutTab } from "./popOutTab";
import { TabDisplaySubmenu } from "@/features/chatPanel/ui/tabs/TabDisplayItems";

/**
 * 右のパネルのタブの右クリックのメニュー: いちばん上に「新しいチャット」（チャットを出す欄だけ。右クリックしたタブのペインに、
 * チャット・新しいチャットのタブなら同じグループ・作業場所で、ほかのタブなら欄の作成先で始める）、表示する場所の組（右・下に分ける・ほかのペインへ移す（ペインが 2 つ以上のとき。ペインは並び順の番号で呼び、
 * 一覧のペインに「（一覧）」と添える）・別ウィンドウで開く・分けたペインのサイドバーと連動したチャットは一覧のペインに戻す）、
 * いちばん下にタブの組（タブの表示 ›・タブを閉じる）。
 * チャットのタブと子チャットのタブには、会話 / 動きの切り替え（見出しの行を隠していても切り替えられるように）と、サイドバーの行と同じチャットの項目
 * （ChatMenuItems。名前を変更・既読 / 未読・固定・セッション ID をコピー・プロジェクトを移動・アーカイブ・削除）も並べる（子チャットのタブも、ふつうのチャットのタブと
 * 同じ並びにする）。
 * 送る前の新しいチャットのタブは、サイドバーの下書きの行と同じ項目（DraftMenuItems。チャットの項目のうち下書きでもできるもの）を同じ並びで
 * 閉じるのすぐ上に「タブの表示 ›」（タブの列の「表示」のメニューの上の部分と同じ項目を横に開く。TabDisplaySubmenu）。
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
  const tab = panel.tabs.find((t) => t.key === tabKey);
  // 子チャットのタブは、店に読み込んだ子チャット（hooks は種類によらず呼ぶ。子チャットでなければ ID 0 = いつも分からない）
  const child = useKnownChat(tab?.kind === "child" ? tab.childId : 0);
  const pane = paneOfTab(panel.layout, tabKey);
  if (!pane) return null;
  const panes = leavesOf(panel.layout.root);
  // ボードの一覧にあればそれを、なければタブの中のチャットから届いたもの（まだ読み込んでいなければチャットの項目は出さない）
  const chat = tab?.kind === "child" ? child : panel.chatOf(tab);
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
  // 表示する場所の組（分ける・ほかのペインへ移す・別ウィンドウ・一覧のペインに戻す）。タブはもう開いているので「開く」は付けず、ペインの右上のボタンと同じ「右に分ける」「下に分ける」と呼ぶ
  const paneItems = (
    <>
      <MenuItem onSelect={() => panel.splitPane(pane.id, "row", "after", tabKey)}>
        <Columns2 size={14} /> 右に分ける
      </MenuItem>
      <MenuItem onSelect={() => panel.splitPane(pane.id, "column", "after", tabKey)}>
        <Rows2 size={14} /> 下に分ける
      </MenuItem>
      {panes.length > 1 &&
        panes.map((p, i) =>
          p.id === pane.id ? null : (
            <MenuItem key={p.id} onSelect={() => panel.moveTab(tabKey, p.id)}>
              <ArrowRightLeft size={14} /> {`ペイン ${i + 1}${p.id === homeId ? "（一覧）" : " "}へ移す`}
            </MenuItem>
          ),
        )}
      {/* チャットのパネルのチャット・チャットの画面の右の欄のサブエージェント・変更・ファイルなどは、別ウィンドウへ移せる（2 枚目の画面に置くなど） */}
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
    </>
  );
  // タブの組（いちばん下。タブの表示 ›・タブを閉じる）
  const tabItems = (
    <>
      <div className="menu-separator" role="separator" />
      <TabDisplaySubmenu panel={panel} />
      {/* メニューの「閉じる」は、チャットの閉じ方を聞かずに閉じる（× と違い、アーカイブ・削除はこのメニューの項目で選べる）。保存していない書きかけのあるファイル・メモは × と同じく保存するかを聞く */}
      <MenuItem onSelect={() => void (tab ? confirmCloseUnsaved(panel.key, tab) : Promise.resolve(true)).then((ok) => ok && panel.closeTab(tabKey))}>
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
          after={tabItems}
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
          after={tabItems}
        />
      ) : (
        <>
          {newChatItem}
          {/* 子チャットがまだ読み込まれていなくても、名前は変えられる（ダブルクリック・Enter と同じ） */}
          {tab?.kind === "child" && (
            <MenuItem onSelect={onRename}>
              <Pencil size={14} /> 名前を変更
            </MenuItem>
          )}
          {paneItems}
          {tabItems}
        </>
      )}
    </PopupMenu>
  );
}

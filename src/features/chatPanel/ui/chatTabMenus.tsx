// チャットのパネル・チャットの画面の右の欄のタブの右クリックのメニュー（種類の Menu）。土台が作った組（表示する場所・タブの組）と並べる。
// チャットのタブと子チャットのタブには、会話 / 動きの切り替え（見出しの行を隠していても切り替えられるように）と、サイドバーの行と同じチャットの項目
// （ChatMenuItems。名前を変更・既読 / 未読・固定・セッション ID をコピー・プロジェクトを移動・アーカイブ・削除）も並べる（子チャットのタブも、ふつうのチャットのタブと同じ並び）。
// 送る前の新しいチャットのタブは、サイドバーの下書きの行と同じ項目（DraftMenuItems。チャットの項目のうち下書きでもできるもの）を同じ並びで
import { GitBranch, MessageSquare, Pencil, SquarePen } from "lucide-react";
import type { Chat } from "@shared/chat/types";
import { alert } from "@/foundation/ui/kit/ask";
import { MenuItem } from "@/foundation/ui/kit/PopupMenu";
import { chatPaneSlot, screenAt, useKnownChat, type NewChatPlace } from "@/features/chat/ui";
import { ChatMenuItems } from "@/features/chatList/ui";
import type { PanelTab, TabMenuProps } from "@/features/panel/ui";
import { DraftMenuItems } from "./drafts/DraftMenuItems";
import { draftOfPanelTab, openNewChat } from "./drafts/panelDrafts";
import { startNewChat } from "./startNewChat";

type MenuOf<K extends PanelTab["kind"]> = TabMenuProps<Extract<PanelTab, { kind: K }>>;

/** 右クリックしたタブのペインで、チャット・新しいチャットのタブと同じグループ・作業場所の新しいチャットを始める（チャットを出す欄だけ） */
const newChatIn = ({ panel, paneId }: TabMenuProps<PanelTab>) =>
  panel.kinds.has("chat")
    ? (place: NewChatPlace) => {
        panel.focusPane(paneId);
        openNewChat(panel.key, place);
      }
    : undefined;

/** 「新しいチャット」（チャットを出す欄だけ。右クリックしたタブのペインに、欄の作成先で始める。チャット・下書きをまだ読み込んでいないタブのメニュー） */
function NewChatItem({ panel, paneId }: TabMenuProps<PanelTab>) {
  if (!panel.kinds.has("chat")) return null;
  return (
    <>
      <MenuItem
        title="このペインで新しいチャットを始める"
        onSelect={() => {
          panel.focusPane(paneId);
          startNewChat(panel);
        }}
      >
        <SquarePen size={14} /> 新しいチャット
      </MenuItem>
      <div className="menu-separator" role="separator" />
    </>
  );
}

/** チャットの項目（会話 / 動きの切り替えを、表示する場所の組の前に足す） */
function ChatItems({ chat, ...props }: TabMenuProps<PanelTab> & { chat: Chat }) {
  const { tab, panel, before, after, onRename, onClose } = props;
  // そのタブで描いているチャットの画面（会話 / 動きを切り替える。描いていなければ出さない）
  const chatPane = screenAt(chatPaneSlot(panel.key, tab.key));
  const activity = chatPane?.activity.showing.get() === "activity";
  const showItem = chatPane && (
    <MenuItem
      onSelect={() => {
        panel.showTab(tab.key);
        chatPane.activity.show(activity ? "conversation" : "activity");
      }}
    >
      {activity ? <MessageSquare size={14} /> : <GitBranch size={14} />} {activity ? "会話に戻る" : "動きを見る"}
    </MenuItem>
  );
  return (
    <ChatMenuItems
      chat={chat}
      onRename={onRename}
      onClose={onClose}
      onError={(m) => void alert("操作できませんでした", m)}
      onNewChat={newChatIn(props)}
      before={
        <>
          {showItem}
          {showItem && <div className="menu-separator" role="separator" />}
          {before}
        </>
      }
      after={after}
    />
  );
}

/** チャットのタブ（ボードの一覧にあればそれを、なければタブの中のチャットから届いたもの。まだ読み込んでいなければチャットの項目は出さない） */
export function ChatTabMenu(props: MenuOf<"chat">) {
  const chat = props.panel.chatOf(props.tab);
  if (chat) return <ChatItems {...props} chat={chat} />;
  return (
    <>
      <NewChatItem {...props} />
      {props.before}
      {props.after}
    </>
  );
}

/** 子チャットのタブ（店に読み込んだ子チャット。まだ読み込まれていなくても、名前は変えられる（ダブルクリック・Enter と同じ）） */
export function ChildTabMenu(props: MenuOf<"child">) {
  const child = useKnownChat(props.tab.childId);
  if (child) return <ChatItems {...props} chat={child} />;
  return (
    <>
      <NewChatItem {...props} />
      <MenuItem onSelect={props.onRename}>
        <Pencil size={14} /> 名前を変更
      </MenuItem>
      {props.before}
      {props.after}
    </>
  );
}

/** 送る前の新しいチャットのタブ */
export function NewChatTabMenu(props: MenuOf<"new">) {
  const draft = draftOfPanelTab(props.panel.key, props.tab);
  if (!draft)
    return (
      <>
        <NewChatItem {...props} />
        {props.before}
        {props.after}
      </>
    );
  return <DraftMenuItems draft={draft} onNewChat={newChatIn(props)} onRename={props.onRename} onClose={props.onClose} before={props.before} after={props.after} />;
}

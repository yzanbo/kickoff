import { ChevronDown, ChevronRight, MessageSquarePlus, SquarePen } from "lucide-react";
import type { ReactNode } from "react";
import type { Chat } from "@shared/types";
import { cx } from "@/lib/cx";
import { useChats, useKnownChat } from "@/stores/chats";
import { AddToChat } from "@/ui/icons";
import { MenuFlyout, useSubmenu } from "@/ui/MenuFlyout";
import { MenuItem, PopupMenu } from "@/ui/PopupMenu";
import { useContextMenu } from "@/ui/useContextMenu";
import { chatTitle } from "@/features/chat/chatTitle";
import { useMainChat } from "@/features/chat/pane/mainChatContext";
import { handOffToChild, handOffToNewChat, handOffToOtherChat, handOffToThisChat, type HandOffItem } from "./handOff";

/** 「ほかのチャットに追加 ▸」に並べるチャットの数（最近動いた順） */
const CHAT_CHOICES = 15;

/**
 * 「AI に渡す ▾」のボタン（各タブの 1 つのもの。issue・PR・DB のつながらない様子など）。押した時点の中身を札にして、選んだチャットの入力欄に入れる（送るのは自分で）。
 * lead はメニューの上に置くその種類だけの項目（CI の「（ブランチ名）で直す」など。区切り線は呼ぶ側で）、extra は下に足す項目（GitHub の「レビューコメントで直す」など）。
 * small でなければダイアログの下のボタンの大きさ。onPick は渡し先を選んだとき（ダイアログを閉じるなど）
 */
export function HandOffButton({
  item,
  lead,
  extra,
  className,
  small = true,
  onPick,
}: {
  item: HandOffItem;
  lead?: ReactNode;
  extra?: ReactNode;
  className?: string;
  small?: boolean;
  onPick?: () => void;
}) {
  const menu = useContextMenu({ align: "end" });
  return (
    <>
      <button
        type="button"
        className={cx("btn hand-off-button", small && "btn-sm", className)}
        aria-haspopup="menu"
        aria-expanded={menu.isOpen}
        data-tip={`${item.what}を、押した時点の中身の札にしてチャットの入力欄に入れる（送るのは自分で）`}
        onClick={(e) => menu.toggle(e)}
      >
        AI に渡す <ChevronDown size={12} aria-hidden />
      </button>
      {menu.menu && (
        <PopupMenu at={menu.menu.at} label="AI に渡す" ignore=".hand-off-button" onClose={menu.close}>
          {lead}
          <HandOffItems item={item} onPick={onPick} />
          {extra}
        </PopupMenu>
      )}
    </>
  );
}

/**
 * 「AI に渡す」の 4 つの渡し先（メニューの中で使う。開いている間だけ描くので、チャットの一覧はこのときだけ読む）:
 * 新しいチャットで始める（作業場所を選ぶ）・このチャットに追加と新しい子チャットで聞く（右の欄・別ウィンドウで、足す先のチャットがあるとき）・ほかのチャットに追加 ▸
 */
export function HandOffItems({ item, onPick }: { item: HandOffItem; onPick?: () => void }) {
  const hide = new Set(item.hide ?? []);
  const pick = (run: () => Promise<void>) => () => {
    void run();
    onPick?.();
  };
  const mainChatId = useMainChat();
  const mainChat = useKnownChat(mainChatId ?? 0);
  const canChild = mainChat && !mainChat.memo_path && mainChat.archived_at === null;
  return (
    <>
      {!hide.has("new") && (
        <MenuItem
          title={item.branch ? `作業場所（新しいワークツリー・本体・いまあるワークツリー）を選んで、${item.what}を入れた新しいチャットを開く` : `${item.what}を入れた新しいチャットを開く`}
          onSelect={pick(() => handOffToNewChat(item))}
        >
          <SquarePen size={14} /> 新しいチャットで始める
        </MenuItem>
      )}
      {mainChat && !hide.has("this") && (
        <MenuItem title={`${item.what}を「${chatTitle(mainChat.title)}」の入力欄に足す`} onSelect={pick(() => handOffToThisChat(item, mainChat))}>
          <AddToChat size={14} /> このチャットに追加
        </MenuItem>
      )}
      {canChild && !hide.has("child") && (
        <MenuItem title={`${item.what}を入れた新しい子チャット（「${chatTitle(mainChat.title)}」の子）を右の欄に開く`} onSelect={pick(() => handOffToChild(item, mainChat))}>
          <MessageSquarePlus size={14} /> 新しい子チャットで聞く
        </MenuItem>
      )}
      {!hide.has("other") && <OtherChatTargets item={item} except={mainChat?.id ?? null} onPick={onPick} />}
    </>
  );
}

/** 「ほかのチャットに追加 ▸」（このプロジェクトの最近動いたチャットから選ぶ。足す先のチャットがなければ「チャットに追加 ▸」） */
function OtherChatTargets({ item, except, onPick }: { item: HandOffItem; except: number | null; onPick?: () => void }) {
  const { chats } = useChats({ projectId: item.projectId });
  const choices = chats.filter((c) => c.id !== except && c.archived_at === null).slice(0, CHAT_CHOICES);
  const chatMenu = useSubmenu();
  const label = except === null ? "チャットに追加" : "ほかのチャットに追加";
  if (choices.length === 0) {
    return (
      <MenuItem disabled title="このプロジェクトに足せるチャットがありません" onSelect={() => {}}>
        <AddToChat size={14} /> {label}
      </MenuItem>
    );
  }
  const pick = (chat: Chat) => {
    void handOffToOtherChat(item, chat);
    onPick?.();
  };
  return (
    <>
      <button {...chatMenu.trigger}>
        <AddToChat size={14} /> {label}
        <ChevronRight size={14} className="menu-submenu-chevron" aria-hidden />
      </button>
      {chatMenu.anchor && (
        <MenuFlyout anchor={chatMenu.anchor} label={label} onBack={chatMenu.back}>
          {choices.map((c) => (
            <MenuItem key={c.id} title={`${item.what}を「${chatTitle(c.title)}」の入力欄に足す（画面は移らず、開いていなければ書きかけに足して知らせる）`} onSelect={() => pick(c)}>
              {chatTitle(c.title)}
            </MenuItem>
          ))}
        </MenuFlyout>
      )}
    </>
  );
}

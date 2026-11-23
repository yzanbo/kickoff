import { ChevronDown, ChevronRight, MessageSquarePlus, SquarePen } from "lucide-react";
import type { ReactNode } from "react";
import type { Chat } from "@shared/chat/types";
import { cx } from "@/foundation/ui/lib/cx";
import { addTargetsOf, chatTitle, useChats, useKnownChat, useMainChat, useOptionalChatScreen } from "@/features/chat/ui";
import { AddToChat } from "@/foundation/ui/kit/icons";
import { MenuFlyout, useSubmenu } from "@/foundation/ui/kit/MenuFlyout";
import { MenuItem, PopupMenu } from "@/foundation/ui/kit/PopupMenu";
import { useContextMenu } from "@/foundation/ui/kit/useContextMenu";
import { handOffChatOf, handOffTargets, visibleHandOffTargets, type HandOffItem, type HandOffPlace, type HandOffTarget, type HandOffTargetId } from "./handOffTargets";

/** 「ほかのチャットに追加 ▸」に並べるチャットの数（最近動いた順） */
const CHAT_CHOICES = 15;

/** 渡し先のアイコン */
const TARGET_ICONS: Record<HandOffTargetId, typeof SquarePen> = { new: SquarePen, this: AddToChat, thisPath: AddToChat, inner: AddToChat, innerPath: AddToChat, child: MessageSquarePlus, other: AddToChat };

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
        className={cx("btn hand-off-button", className)}
        data-size={small ? "sm" : undefined}
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
 * 「AI に渡す」の渡し先（メニューの中で使う。開いている間だけ描くので、チャットの一覧はこのときだけ読む）。並びは登録の order の順:
 * 新しいチャットで始める（作業場所を選ぶ）・このチャットに追加と新しい子チャットで聞く（右の欄・別ウィンドウで、足す先のチャットがあるとき）・ほかのチャットに追加 ▸。
 * 右の欄の中の子チャット・ノートのチャットの中なら、そのチャットに追加も。item.path があれば、足す先のチャットごとに「パスを〜に追加」も
 */
export function HandOffItems({ item, onPick }: { item: HandOffItem; onPick?: () => void }) {
  const place = useHandOffPlace();
  return visibleHandOffTargets(handOffTargets.items(), item, place).map((target) => {
    const Icon = TARGET_ICONS[target.id];
    if (target.pickChat) return <OtherChatTargets key={target.id} target={target} item={item} mainChat={place.mainChat} onPick={onPick} />;
    const chat = handOffChatOf(target, place);
    return (
      <MenuItem
        key={target.id}
        title={target.title(item, chat)}
        onSelect={() => {
          void target.run(item, chat);
          onPick?.();
        }}
      >
        <Icon size={14} /> {target.label(place)}
      </MenuItem>
    );
  });
}

/** 開いた所（足す先のチャットと、右の欄の中の別のチャット。決め方は addTargetsOf） */
function useHandOffPlace(): HandOffPlace {
  const mainChatId = useMainChat();
  const screen = useOptionalChatScreen();
  const inner = addTargetsOf({ chatId: screen?.chatId ?? null, mainChatId, role: screen?.role ?? null, mainName: "" }).find((t) => t.kind === "inner");
  const mainChat = useKnownChat(mainChatId ?? 0) ?? null;
  const innerChat = useKnownChat(inner?.chatId ?? 0) ?? null;
  return { mainChat, inner: inner && innerChat ? { chat: innerChat, name: inner.name } : null };
}

/** 「ほかのチャットに追加 ▸」（このプロジェクトの最近動いたチャットから選ぶ。足す先のチャットがなければ「チャットに追加 ▸」） */
function OtherChatTargets({ target, item, mainChat, onPick }: { target: HandOffTarget; item: HandOffItem; mainChat: Chat | null; onPick?: () => void }) {
  const { chats } = useChats({ projectId: item.projectId });
  const choices = chats.filter((c) => c.id !== mainChat?.id && c.archived_at === null).slice(0, CHAT_CHOICES);
  const chatMenu = useSubmenu();
  const label = target.label({ mainChat, inner: null }) ?? "";
  if (choices.length === 0) {
    return (
      <MenuItem disabled title="このプロジェクトに足せるチャットがありません" onSelect={() => {}}>
        <AddToChat size={14} /> {label}
      </MenuItem>
    );
  }
  const pick = (chat: Chat) => {
    void target.run(item, chat);
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
            <MenuItem key={c.id} title={target.title(item, c)} onSelect={() => pick(c)}>
              {chatTitle(c.title)}
            </MenuItem>
          ))}
        </MenuFlyout>
      )}
    </>
  );
}

import { Fragment } from "react";
import { MenuItem } from "@/foundation/ui/kit/PopupMenu";
import { appendToDraft } from "@/features/composer/ui";
import { addTargetsOf, useOptionalChatScreen } from "@/features/chat/ui";
import { useMainChat } from "@/features/chat/ui/screen/mainChat";
import { knownChat } from "@/features/chat/ui/store/knownChats";
import { chatTargetName } from "@/features/chat/ui/chatTitle";

/**
 * 右クリックのメニューの、チャットに足す組（足す先は addTargetsOf）。
 * - 右の欄・別ウィンドウ（サブエージェント・子チャット・ノートのチャット）: 見出し（足す先のチャットの名前。「機能開発」など）の下に「選択部分を追加」など
 *   （quote。引用にしたもの。what は「選択部分」「メッセージ」など足すものの呼び名）。子チャット・ノートのチャットの中なら、
 *   そのチャットの組も続ける（ノートの本文のメニューと同じ形）
 * - チャットの画面の中（右の欄・別ウィンドウの外）: 見出しなしで「選択部分をチャットに追加」など（選んだときの「チャットに追加」のボタンと同じ）
 * どれも最後に区切り線。チャットの外では何も出さない（送るのは自分で）
 */
export function AddToChatItems({ quote, what }: { quote: string | null; what: string }) {
  const main = useMainChat();
  const screen = useOptionalChatScreen();
  if (!quote) return null;
  // 中のチャット（右の欄・別ウィンドウの中の子チャット・ノートのチャット、またはチャットの画面のこのチャット）
  const inner = screen;
  const targets = addTargetsOf({ chatId: inner?.chatId ?? null, mainChatId: main, role: inner?.role ?? null, mainName: main === null ? "" : chatTargetName(knownChat(main)) });
  const add = (chatId: number, text: string) => appendToDraft(chatId, text);
  if (main === null) {
    if (targets.length === 0) return null;
    return (
      <>
        <MenuItem title="引用にして、このチャットの入力欄に足します（送るのは自分で）" onSelect={() => add(targets[0].chatId, quote)}>
          {what}をチャットに追加
        </MenuItem>
        <div className="menu-separator" role="separator" />
      </>
    );
  }
  return targets.map((target) => (
    <Fragment key={target.kind}>
      <div className="menu-label">{target.name}</div>
      <MenuItem title={`引用にして、${target.name}の入力欄に足します（送るのは自分で）`} onSelect={() => add(target.chatId, quote)}>
        {what}を追加
      </MenuItem>
      <div className="menu-separator" role="separator" />
    </Fragment>
  ));
}

import { Fragment } from "react";
import { MenuItem } from "@/foundation/ui/kit/PopupMenu";
import { addToChat } from "@/features/composer/ui/addToChat";
import { useComposerPort, useOptionalChatScreen } from "@/features/chat/ui";
import { useMainChat } from "@/features/chat/ui/screen/mainChat";
import { knownChat } from "@/features/chat/ui/store/knownChats";
import { chatTargetName } from "@/features/chat/ui/chatTitle";

/** 中のチャットの画面の種類（ChatView の data-chat-role）ごとの組の見出し */
const INNER_NAMES: Record<string, string> = { child: "子チャット", note: "ノートのチャット" };

/**
 * 右クリックのメニューの、チャットに足す組。
 * - 右の欄・別ウィンドウ（サブエージェント・変更・ファイル・子チャット・ノートのチャット）: 見出し（足す先のチャットの名前。「機能開発」など）の下に「選択部分を追加」など
 *   （quote。引用にしたもの。what は「選択部分」「メッセージ」など足すものの呼び名）と「パスを追加」（path）。子チャット・ノートのチャットの中なら、
 *   そのチャットの組も続ける（ノートの本文のメニューと同じ形）
 * - チャットの画面の中（右の欄・別ウィンドウの外）: 見出しなしで「選択部分をチャットに追加」など（選んだときの「チャットに追加」のボタンと同じ）
 * どれも最後に区切り線。チャットの外では何も出さない（送るのは自分で）
 */
export function AddToChatItems({ quote, what, path }: { quote: string | null; what: string; path?: string | null }) {
  const main = useMainChat();
  const screen = useOptionalChatScreen();
  const composer = useComposerPort();
  if (!quote && !path) return null;
  if (main === null) {
    if (!screen || !composer || !quote) return null;
    return (
      <>
        <MenuItem title="引用にして、このチャットの入力欄に足します（送るのは自分で）" onSelect={() => composer.fill(quote, { append: true })}>
          {what}をチャットに追加
        </MenuItem>
        <div className="menu-separator" role="separator" />
      </>
    );
  }
  const inner = screen && composer && screen.chatId !== main ? { root: screen.root, fill: composer.fill } : null;
  const groups = [
    { key: "main", name: chatTargetName(knownChat(main)), add: (text: string) => addToChat(main, text) },
    ...(inner
      ? [{ key: "inner", name: INNER_NAMES[inner.root.current?.dataset.chatRole ?? ""] ?? "このチャット", add: (text: string) => inner.fill(text, { append: true }) }]
      : []),
  ];
  return groups.map((group) => (
    <Fragment key={group.key}>
      <div className="menu-label">{group.name}</div>
      {quote && (
        <MenuItem title={`引用にして、${group.name}の入力欄に足します（送るのは自分で）`} onSelect={() => group.add(quote)}>
          {what}を追加
        </MenuItem>
      )}
      {path && (
        <MenuItem title={`ファイルのフルパスを、${group.name}の入力欄に足します`} onSelect={() => group.add(path)}>
          パスを追加
        </MenuItem>
      )}
      <div className="menu-separator" role="separator" />
    </Fragment>
  ));
}

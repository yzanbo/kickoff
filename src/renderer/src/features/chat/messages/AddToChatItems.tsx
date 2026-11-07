import { Fragment } from "react";
import { MenuItem } from "@/ui/PopupMenu";
import { addToChat } from "@/features/chat/pane/addToChat";
import { useOptionalChatPane } from "@/features/chat/pane/chatPaneContext";
import { useMainChat } from "@/features/chat/pane/mainChatContext";
import { knownChat } from "@/stores/chats";
import { parentTargetName } from "@/features/chat/chatTitle";

/** 中のチャットの画面の種類（ChatView の data-chat-role）ごとの組の見出し */
const INNER_NAMES: Record<string, string> = { child: "子チャット", memo: "メモのチャット" };

/**
 * 右クリックのメニューの、チャットに足す組。
 * - 右の欄・別ウィンドウ（サブエージェント・変更・ファイル・子チャット・メモのチャット）: 見出し（足す先のチャットの名前。「機能開発」など。
 *   子チャットの中で、足す先がその直接の親なら「親チャット（機能開発）」）の下に「選択部分を追加」など
 *   （quote。引用にしたもの。what は「選択部分」「メッセージ」など足すものの呼び名）と「パスを追加」（path）。子チャット・メモのチャットの中なら、
 *   そのチャットの組も続ける（メモの本文のメニューと同じ形）
 * - チャットの画面の中（右の欄・別ウィンドウの外）: 見出しなしで「選択部分をチャットに追加」など（選んだときの「チャットに追加」のボタンと同じ）
 * どれも最後に区切り線。チャットの外では何も出さない（送るのは自分で）
 */
export function AddToChatItems({ quote, what, path }: { quote: string | null; what: string; path?: string | null }) {
  const main = useMainChat();
  const pane = useOptionalChatPane();
  if (!quote && !path) return null;
  if (main === null) {
    if (!pane || !quote) return null;
    return (
      <>
        <MenuItem title="引用にして、このチャットの入力欄に足します（送るのは自分で）" onSelect={() => pane.fillComposer(quote, { append: true })}>
          {what}をチャットに追加
        </MenuItem>
        <div className="menu-separator" role="separator" />
      </>
    );
  }
  const inner = pane && pane.chatId !== main ? pane : null;
  const groups = [
    { key: "main", name: parentTargetName(knownChat(main), inner ? knownChat(inner.chatId) : undefined), add: (text: string) => addToChat(main, text) },
    ...(inner
      ? [{ key: "inner", name: INNER_NAMES[inner.root.current?.dataset.chatRole ?? ""] ?? "このチャット", add: (text: string) => inner.fillComposer(text, { append: true }) }]
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

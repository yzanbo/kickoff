import { Fragment } from "react";
import { MenuItem } from "@/ui/PopupMenu";
import { addToChat } from "@/features/chat/pane/addToChat";
import { useOptionalChatPane } from "@/features/chat/pane/chatPaneContext";
import { useMainChat } from "@/features/chat/pane/mainChatContext";

/** 中のチャットの画面の種類（ChatView の data-chat-role）ごとの組の見出し */
const INNER_NAMES: Record<string, string> = { child: "子チャット", memo: "メモのチャット" };

/**
 * 右の欄・別ウィンドウ（サブエージェント・変更・ファイル・子チャット・メモのチャット）の右クリックのメニューの、チャットに足す組。
 * 見出し「メインのチャット」の下に「選択部分を追加」など（quote。引用にしたもの）と「パスを追加」（path）。子チャット・メモのチャットの中なら、
 * そのチャットの組も続ける（メモの本文のメニューと同じ形）。どの組も最後に区切り線。右の欄・別ウィンドウの外では何も出さない（送るのは自分で）
 */
export function AddToChatItems({ quote, quoteLabel, path }: { quote: string | null; quoteLabel: string; path?: string | null }) {
  const main = useMainChat();
  const pane = useOptionalChatPane();
  if (main === null || (!quote && !path)) return null;
  const inner = pane && pane.chatId !== main ? pane : null;
  const groups = [
    { key: "main", name: "メインのチャット", add: (text: string) => addToChat(main, text) },
    ...(inner
      ? [{ key: "inner", name: INNER_NAMES[inner.root.current?.dataset.chatRole ?? ""] ?? "このチャット", add: (text: string) => inner.fillComposer(text, { append: true }) }]
      : []),
  ];
  return groups.map((group) => (
    <Fragment key={group.key}>
      <div className="menu-label">{group.name}</div>
      {quote && (
        <MenuItem title={`引用にして、${group.name}の入力欄に足します（送るのは自分で）`} onSelect={() => group.add(quote)}>
          {quoteLabel}
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

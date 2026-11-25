import { Mail, MailOpen } from "lucide-react";
import { READ_TOGGLE_BUSY_NOTE, READ_TOGGLE_LABELS, readToggleOf } from "@shared/chat/readTiming";
import type { Chat } from "@shared/chat/types";
import { errorMessage } from "@shared/foundation/errors";
import { keyLabel } from "@/foundation/ui/commands";
import { reportFailure } from "@/foundation/ui/kit/ask";
import { MenuItem } from "@/foundation/ui/kit/PopupMenu";
import { useChatStates } from "@/features/chat/ui/state/chatStates";
import { READ_TOGGLE_KEY, setChatRead } from "@/features/chat/ui/state/readToggle";
import { useChatOf } from "@/features/chat/ui/store/useChatStore";

/**
 * 右クリックのメニューの「既読にする」/「未読にする」（いまの状態に合わせて片方だけ。サイドバー・ボード・タブ・チャットの画面で同じ）。
 * 作業中・回答待ちは押せない（未読・既読は作業が終わってからだけの状態）。キーはチャットの画面で効く ⌘⇧U を添える
 */
export function ReadToggleItem({ chat, onError }: { chat: Chat; /** 失敗を出す（省けばダイアログ） */ onError?: (message: string) => void }) {
  const toggle = readToggleOf(useChatStates().stateOf(chat));
  const fail = onError ? (e: unknown) => onError(errorMessage(e)) : reportFailure("未読・既読を変えられませんでした");
  return (
    <MenuItem disabled={!toggle} title={toggle ? undefined : READ_TOGGLE_BUSY_NOTE} onSelect={() => toggle && void setChatRead(chat, toggle).catch(fail)}>
      {toggle === "seen" ? <MailOpen size={14} /> : <Mail size={14} />} {READ_TOGGLE_LABELS[toggle ?? (chat.unread ? "seen" : "unseen")]}
      <kbd className="menu-key">{keyLabel(READ_TOGGLE_KEY)}</kbd>
    </MenuItem>
  );
}

/** チャットの画面の中の右クリック（発言・見出し・流れの何もないところ）で出す同じ項目（画面の詳細のチャットを読む。まだ読めていなければ出さない） */
export function ChatReadToggleItem({ chatId }: { chatId: number }) {
  const chat = useChatOf(chatId);
  return chat ? <ReadToggleItem chat={chat} /> : null;
}

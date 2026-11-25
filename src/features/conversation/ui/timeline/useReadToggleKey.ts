import type { RefObject } from "react";
import { readToggleOf } from "@shared/chat/readTiming";
import type { Chat } from "@shared/chat/types";
import { matchKey } from "@/foundation/ui/commands";
import { reportFailure } from "@/foundation/ui/kit/ask";
import { READ_TOGGLE_KEY, setChatRead, useChatStates } from "@/features/chat/ui";
import { useChatHotkey } from "@/features/conversation/ui/chatHotkeys";

/**
 * ⌘⇧U で既読⇔未読を切り替える（どちらの既読にするタイミングでも。一番下にいるかによらない）。
 * このチャットにピントがあるか、どこにもピントがなく最後に押したのがこのチャットのときだけ受ける。作業中・回答待ちは何もしない
 */
export function useReadToggleKey(root: RefObject<HTMLElement | null>, chat: Chat) {
  const { stateOf } = useChatStates();
  useChatHotkey(
    root,
    (e) => matchKey(e, READ_TOGGLE_KEY),
    (e) => {
      e.preventDefault();
      const toggle = readToggleOf(stateOf(chat));
      if (toggle) void setChatRead(chat, toggle).catch(reportFailure("未読・既読を変えられませんでした"));
    },
    { pressed: true },
  );
}

import type { RefObject } from "react";
import { readToggleOf, showsReadButton, type ReadToggle } from "@shared/chat/readTiming";
import { chatSettings } from "@shared/chat/settings";
import type { Chat } from "@shared/chat/types";
import { matchKey } from "@/foundation/ui/commands";
import { useAppSettings } from "@/foundation/ui/settings/appSettings";
import { READ_TOGGLE_KEY, reportReadFailure, setChatRead, useChatStates } from "@/features/chat/ui";
import { useChatHotkey } from "@/features/conversation/ui/chatHotkeys";

/**
 * チャットの画面の既読の操作: 既読にするタイミング（設定）・⌘⇧U の既読⇔未読・ボタンで既読にする設定の既読ボタンを出すか。
 * 状態は右クリックの「未読にする / 既読にする」と同じ回答待ちの店から引く（作業中・回答待ちは何もしない・出さない）。
 * ⌘⇧U はどちらのタイミングでも、一番下にいるかによらず効く。このチャットにピントがあるか、どこにもピントがなく最後に押したのがこのチャットのときだけ受ける
 */
export function useReadControls(root: RefObject<HTMLElement | null>, chat: Chat, away: boolean) {
  const timing = useAppSettings().data?.read_timing ?? chatSettings.read_timing.default;
  const state = useChatStates().stateOf(chat);
  const setRead = (to: ReadToggle) => void setChatRead(chat, to).catch(reportReadFailure);
  useChatHotkey(
    root,
    (e) => matchKey(e, READ_TOGGLE_KEY),
    (e) => {
      e.preventDefault();
      const toggle = readToggleOf(state);
      if (toggle) setRead(toggle);
    },
    { pressed: true },
  );
  return {
    timing,
    /** 既読ボタンを出すか（一番下まで来て、作業が終わって未読のとき。一番下へ戻るボタンと同じ場所） */
    readButton: showsReadButton(timing, state, !away),
    markSeen: () => setRead("seen"),
  };
}

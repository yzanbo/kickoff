// 会話と動きを切り替える口（ActivityNav）の実装。チャットの画面がチャットごとに 1 回だけ作る
import { createCell } from "@/foundation/ui/store";
import type { ActivityFilter, ActivityFocus, ActivityNav, ChatShowing } from "@/features/chat/ui";

export interface ActivityNavDeps {
  /** 会話・動きへ移る前にすること（ピルの列を画面の外に描いているとき、画面を見せる・右の欄が覆っていれば並べる形に戻す） */
  beforeShow: () => void;
  /** 会話のその記録へ移る（またがる操作。screenActions.ts が組む） */
  revealInConversation: ActivityNav["revealInConversation"];
}

export function createActivityNav({ beforeShow, revealInConversation }: ActivityNavDeps): ActivityNav {
  const showing = createCell<ChatShowing>("conversation");
  const filter = createCell<ActivityFilter>({ kind: "all" });
  const focused = createCell<ActivityFocus | null>(null);
  return {
    show: (next, nextFilter) => {
      beforeShow();
      showing.set(next);
      // 絞り込みを選び直したら、強調はやめる
      if (nextFilter) {
        filter.set(nextFilter);
        focused.set(null);
      }
    },
    focus: (key) => {
      beforeShow();
      const nonce = (focused.get()?.nonce ?? 0) + 1;
      showing.set("activity");
      filter.set({ kind: "all" });
      focused.set({ key, nonce });
    },
    clearFocus: () => focused.set(null),
    revealInConversation,
    showing,
    filter,
    focused,
  };
}

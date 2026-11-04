import type { FocusEvent, KeyboardEvent } from "react";
import { consumeKey, isCancelKey, isSubmitKey } from "@/lib/keys";
import { useHeldMeta } from "./useHeldMeta";

/**
 * 書き直しの欄のキー（発言の書き直し・送信待ちの書き直し・質問の「その他」・選んだ範囲へのコメントで共通）:
 * Enter で決める（⌘Enter なら meta。保存していま送るなど）・Shift+Enter で改行・Esc でやめる（onCancel を渡したとき。パネルを閉じる Esc には渡さない）。
 * 変換中の Enter・Esc は変換に使い、決めない・やめない。⌘ だけを押している間は heldMeta（⌘Enter で使われるボタンを光らせる）。
 * keyProps を欄（textarea）に渡す
 */
export function useEditKeys({ onSubmit, onCancel }: { onSubmit: (how: { meta: boolean }) => void; onCancel?: () => void }) {
  const held = useHeldMeta();
  return {
    heldMeta: held.held === "meta",
    keyProps: {
      onKeyDown: (e: KeyboardEvent<HTMLElement>) => {
        held.track(e);
        if (isSubmitKey(e)) {
          e.preventDefault();
          onSubmit({ meta: e.metaKey });
        } else if (onCancel && isCancelKey(e)) {
          consumeKey(e);
          onCancel();
        }
      },
      onKeyUp: (e: KeyboardEvent<HTMLElement>) => held.track(e),
      onBlur: (_e: FocusEvent<HTMLElement>) => held.clear(),
    },
  };
}

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { permissionChoices } from "@/features/chat/options/models";
import type { RunOptionsState } from "@/features/chat/options/ChatOptionsBar";

/** 作業中に送るときの扱い（伝える = 止めずに、いまのやり取りに足す / ためておく = 終わったら送る） */
export type QueueSendMode = "tell" | "queue";

/** 作業中の送り方をキーで決める: ⌘⇧Enter = ためておく、⌘Enter = 伝える（どちらでもなければ、チャット欄の切り替えのとおり） */
export const sendModeOf = (e: { metaKey: boolean; shiftKey: boolean }): QueueSendMode | undefined => (e.metaKey ? (e.shiftKey ? "queue" : "tell") : undefined);

/** 送信の Enter か（Shift+Enter は改行。⌘⇧Enter は送り方を決めた送信。日本語入力の変換を確定する Enter は除く） */
export const isSendEnter = (e: KeyboardEvent) => e.key === "Enter" && (!e.shiftKey || e.metaKey) && !e.nativeEvent.isComposing && e.keyCode !== 229;

/** 1 回目の Esc のあと、もう一度押すと中断する、と待つ時間 */
const STOP_CONFIRM_MS = 2000;

/**
 * チャット欄のよく使う操作のキー:
 * - Esc を 2 回（作業中）: 中断する。1 回目は「もう一度 Esc で中断」と出すだけ（Esc はパネルを閉じるのにも使うので、
 *   うっかり止めないように）。作業中でなければ、これまでどおりパネルを閉じる Esc に任せる
 * - Shift+Tab（入力欄）: 権限モードを順に切り替える（そのモデルで選べるものだけ）
 * ほかの部品が先に扱ったキー（候補の一覧・録音など）は見ない
 */
export function useComposerKeys({ busy, onStop, options }: { busy?: boolean; onStop?: () => void; options?: RunOptionsState }) {
  const [stopArmed, setStopArmed] = useState(false);
  const timer = useRef<number>(undefined);
  const disarm = () => {
    window.clearTimeout(timer.current);
    setStopArmed(false);
  };
  // 作業が終わったら、中断の待ちは消す
  useEffect(() => {
    if (!busy) disarm();
  }, [busy]);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  /** 扱ったら true */
  function onKeyDown(e: KeyboardEvent<HTMLElement>): boolean {
    if (e.defaultPrevented || e.nativeEvent.isComposing) return false;
    const plain = !e.metaKey && !e.altKey && !e.ctrlKey;
    if (e.key === "Tab" && e.shiftKey && plain && options && e.target instanceof HTMLTextAreaElement) {
      e.preventDefault();
      const choices = permissionChoices(options.current);
      options.setPermission(choices[(choices.indexOf(options.permission) + 1) % choices.length]);
      return true;
    }
    if (e.key === "Escape" && !e.shiftKey && plain && busy && onStop) {
      // パネルを閉じる Esc に渡さない
      e.preventDefault();
      e.stopPropagation();
      if (stopArmed) {
        disarm();
        onStop();
      } else {
        setStopArmed(true);
        timer.current = window.setTimeout(() => setStopArmed(false), STOP_CONFIRM_MS);
      }
      return true;
    }
    return false;
  }

  return { stopArmed, onKeyDown };
}

/**
 * ⌘L: チャット欄にピントを移す。ピントのある・表示中のパネルのチャット欄を優先し、なければ画面に見えている最初のチャット欄。
 * 移せたら true
 */
export function focusChatComposer(): boolean {
  const visible = (el: HTMLTextAreaElement) => el.offsetParent !== null;
  const inPage = document.activeElement?.closest(".panel-tab-page")?.querySelector<HTMLTextAreaElement>(".composer textarea");
  const focusedPane = document.querySelector<HTMLTextAreaElement>(".panel-tab-page.pane-focused:not([hidden]) .composer textarea");
  const target = [inPage, focusedPane, ...document.querySelectorAll<HTMLTextAreaElement>(".composer textarea")].find(
    (el): el is HTMLTextAreaElement => Boolean(el) && visible(el!),
  );
  if (!target) return false;
  target.focus();
  target.setSelectionRange(target.value.length, target.value.length);
  return true;
}

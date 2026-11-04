import { useEffect, type RefObject } from "react";
import { useWindowEvent } from "@/hooks/useWindowEvent";

/**
 * 最後に押したチャット（流れの文を押すだけではピントが移らないので、押したチャットを ⌘F の行き先にする）。
 * どこを押しても覚え直す（チャットの外を押したら外れる。ボードを押したあとの ⌘F はボードの検索欄へ）
 */
let lastPressed: Element | null = null;
let watching = false;
function watchPresses() {
  if (watching) return;
  watching = true;
  window.addEventListener(
    "pointerdown",
    (e) => {
      lastPressed = (e.target as Element | null)?.closest?.(".run-page") ?? null;
    },
    true,
  );
}

/**
 * ⌘F: このチャットの中の検索欄（見出しの行にいつもある）にピントを移し、文を選ぶ。
 * ピントがこのチャットの中にあるとき、またはどこにもピントがなく最後に押したのがこのチャットのとき。
 * アプリ全体の ⌘F（ボードのチャット名の検索欄へ）より先に、捕捉で受け取る
 */
export function useChatFindKey(root: RefObject<HTMLElement | null>) {
  useEffect(watchPresses, []);
  useWindowEvent(
    "keydown",
    (e) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey || e.key.toLowerCase() !== "f") return;
      const el = root.current;
      const active = document.activeElement;
      const nothingFocused = !active || active === document.body;
      // 隠れているタブ・閉じたパネルのチャットでは開かない
      if (!el || !el.offsetParent || el.closest("[inert]")) return;
      if (!(el.contains(active) || (nothingFocused && lastPressed === el))) return;
      const input = el.querySelector<HTMLInputElement>(".chat-find input");
      if (!input) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      // 見出しの行の検索欄にピントを移し、前に打った文を選んで打ち直せるようにする
      input.focus();
      input.select();
    },
    true,
    true,
  );
}

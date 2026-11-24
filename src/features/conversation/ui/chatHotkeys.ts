import type { RefObject } from "react";
import { useWindowEvent } from "@/foundation/ui/hooks/useWindowEvent";
import { lastPressedElement, lastPressedScreen } from "@/features/chat/ui";

// チャットの画面のキー（⌘↓・⌘⌥↑ / ↓・⌃R・⌘F）を、ピントがそのチャットにあるときだけ受け取る仕組み

/**
 * キーをこのチャット（root）で受け取るか: ピントがこのチャットの中にある、または pressed のときは、どこにもピントがなく最後に押したのがこのチャット。
 * 隠れているタブ・閉じたパネルのチャットでは受け取らない
 */
function isChatTarget(root: HTMLElement | null, pressed = false): boolean {
  if (!root || !root.offsetParent || root.closest("[inert]")) return false;
  const active = document.activeElement;
  if (root.contains(active)) return !inNestedPanel(root, active);
  return pressed && (!active || active === document.body) && lastPressedScreen()?.root.current === root && !inNestedPanel(root, lastPressedElement());
}

/**
 * el が、このチャットの画面の中の右の欄（入れ子の欄）にあるか。そこでのキーは右の欄（のタブ）が受け取る
 * （右の欄の中の ⌘F は、親のチャットの検索ではなく、表示しているタブの中を探す。右の欄の子チャットは、自分の画面のキーとして受け取る）
 */
function inNestedPanel(root: HTMLElement, el: Element | null): boolean {
  const panel = el?.closest("[data-panel-key^='agents:']");
  return Boolean(panel && panel !== root && root.contains(panel));
}

/**
 * このチャットのキー: match に合い、このチャットで受け取るとき（isChatTarget）だけ handler を呼ぶ（既定の動きを止めるのは handler）。
 * capture: ほかより先に受け取る（縦スライドのプロジェクトの切り替え・アプリ全体の ⌘F より優先する）。
 * pressed: どこにもピントがないときも、最後に押したのがこのチャットなら受け取る（押した画面はチャットの画面の登録簿 chatScreens.ts が見る）
 */
export function useChatHotkey(
  root: RefObject<HTMLElement | null>,
  match: (e: KeyboardEvent) => boolean,
  handler: (e: KeyboardEvent) => void,
  { enabled = true, capture = false, pressed = false }: { enabled?: boolean; capture?: boolean; pressed?: boolean } = {},
) {
  useWindowEvent(
    "keydown",
    (e) => {
      if (match(e) && isChatTarget(root.current, pressed)) handler(e);
    },
    enabled,
    capture,
  );
}

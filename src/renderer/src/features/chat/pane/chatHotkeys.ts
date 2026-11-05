import { useEffect, type RefObject } from "react";
import { useWindowEvent } from "@/hooks/useWindowEvent";

// チャットの画面のキー（⌘↓・⌘⌥↑ / ↓・⌃R・⌘F）を、ピントがそのチャットにあるときだけ受け取る仕組み（以前は 4 か所で別々に、クラス名で画面を探して判定していた）

/** 押したかを見るチャットの画面（⌘F のように、どこにもピントがないときも、最後に押したチャットで受け取るもの） */
const pressRoots = new Set<HTMLElement>();
/** 最後に押したチャットの画面（チャットの外を押したら null。流れの文を押すだけではピントが移らないため） */
let lastPressed: HTMLElement | null = null;
/** 最後に押した要素（右の欄の中を押したかを見る） */
let lastTarget: Element | null = null;
let watching = false;

function watchPresses() {
  if (watching) return;
  watching = true;
  window.addEventListener(
    "pointerdown",
    (e) => {
      const target = e.target instanceof Node ? e.target : null;
      lastTarget = e.target instanceof Element ? e.target : null;
      // 入れ子（右の欄の子チャット）なら、いちばん内側のチャットの画面
      const roots = target ? [...pressRoots].filter((root) => root.contains(target)) : [];
      lastPressed = roots.find((root) => !roots.some((other) => other !== root && root.contains(other))) ?? null;
    },
    true,
  );
}

/**
 * キーをこのチャット（root）で受け取るか: ピントがこのチャットの中にある、または pressed のときは、どこにもピントがなく最後に押したのがこのチャット。
 * 隠れているタブ・閉じたパネルのチャットでは受け取らない
 */
export function isChatTarget(root: HTMLElement | null, pressed = false): boolean {
  if (!root || !root.offsetParent || root.closest("[inert]")) return false;
  const active = document.activeElement;
  if (root.contains(active)) return !inNestedPanel(root, active);
  return pressed && (!active || active === document.body) && lastPressed === root && !inNestedPanel(root, lastTarget);
}

/**
 * el が、このチャットの画面の中の右の欄（入れ子の欄）にあるか。そこでのキーは右の欄（のタブ）が受け取る
 * （右の欄の中の ⌘F は、親のチャットの検索ではなく、表示しているタブの中を探す。右の欄の子チャットは、自分の画面のキーとして受け取る）
 */
function inNestedPanel(root: HTMLElement, el: Element | null): boolean {
  const panel = el?.closest("[data-panel-key^='agents:']");
  return Boolean(panel && panel !== root && root.contains(panel));
}

/** 最後に押した要素（右の欄の検索が、ピントがないときにどの欄で受け取るかを決める） */
export const lastPressedElement = (): Element | null => lastTarget;

/**
 * このチャットのキー: match に合い、このチャットで受け取るとき（isChatTarget）だけ handler を呼ぶ（既定の動きを止めるのは handler）。
 * capture: ほかより先に受け取る（縦スライドのプロジェクトの切り替え・アプリ全体の ⌘F より優先する）。
 * pressed: どこにもピントがないときも、最後に押したのがこのチャットなら受け取る
 */
export function useChatHotkey(
  root: RefObject<HTMLElement | null>,
  match: (e: KeyboardEvent) => boolean,
  handler: (e: KeyboardEvent) => void,
  { enabled = true, capture = false, pressed = false }: { enabled?: boolean; capture?: boolean; pressed?: boolean } = {},
) {
  useEffect(() => {
    const el = root.current;
    if (!pressed || !el) return;
    watchPresses();
    pressRoots.add(el);
    return () => {
      pressRoots.delete(el);
      if (lastPressed === el) lastPressed = null;
    };
  }, [pressed, root]);
  useWindowEvent(
    "keydown",
    (e) => {
      if (match(e) && isChatTarget(root.current, pressed)) handler(e);
    },
    enabled,
    capture,
  );
}

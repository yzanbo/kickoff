// 欄のキー（Esc で閉じる・⌘\ で右に分ける）。入れ子の欄（チャットの中の右の欄）では、ピントのあるいちばん内側の欄だけが受け取る
import { useWindowEvent } from "@/foundation/ui/hooks/useWindowEvent";
import { isComposing, type KeyInput } from "@/foundation/ui/lib/keys";
import { focusedPanelKey, focusInNestedPanel } from "./panelHost";
import type { PanelFrame } from "./PanelTools";
import { splitShownTab } from "@/features/panel/ui/state/actions";
import { surfaceOf } from "@/features/panel/ui/state/panelStore";
import type { PanelController } from "./usePanel";

/** Esc で欄を閉じるかを決める画面の様子（呼ぶ側が読んで渡す） */
export interface EscContext {
  /** 欄の決まりの closeOnEsc（いつも開いておく欄・画面そのものの欄は false） */
  rule: boolean | "focused";
  /** この欄の覚える名前 */
  key: string;
  /** ピントのある要素をいちばん内側で含む欄（focusedPanelKey） */
  focusedKey: string | undefined;
  /** ピントがこの欄の中の入れ子の欄にあるか（focusInNestedPanel） */
  nestedFocus: boolean;
  /** ダイアログ・メニューが開いているか（そちらの Esc を先にする） */
  dialogOpen: boolean;
}

/**
 * Esc で欄を閉じるか: Esc で閉じる欄だけ。日本語入力の変換をやめる Esc・ダイアログやメニューが開いているときは閉じない。
 * focused の欄（チャットの右の欄）はピントが中にあるときだけ、ほかの欄はピントが中の入れ子の欄にあれば閉じない（そちらに任せる）
 */
export function shouldClosePanelOnEsc(e: KeyInput, { rule, key, focusedKey, nestedFocus, dialogOpen }: EscContext): boolean {
  if (e.key !== "Escape" || isComposing(e) || dialogOpen || rule === false) return false;
  return rule === "focused" ? focusedKey === key : !nestedFocus;
}

/** ⌘\（修飾キーは ⌘ だけ） */
const isSplitKey = (e: KeyboardEvent) => e.metaKey && !e.altKey && !e.ctrlKey && !e.shiftKey && e.code === "Backslash";

/**
 * 欄のキーを受ける（Panel が呼ぶ。欄が開いている間だけ）: Esc で閉じる（欄の決まりの closeOnEsc。いつも開いておく欄・画面そのものの欄 frame.fixed は閉じない）、
 * ⌘\ でピントのあるペインを右に分ける（ピントがこの欄にあるときだけ。下のパネルの ⌘\ はそちらにピントがあるときだけ）
 */
export function usePanelShortcuts(panel: PanelController, frame: PanelFrame | undefined) {
  const rules = surfaceOf(panel.surface);
  const rule = frame?.fixed || rules?.alwaysOpen ? false : (rules?.closeOnEsc ?? false);
  useWindowEvent(
    "keydown",
    (e) => {
      if (e.key !== "Escape") return;
      const close = shouldClosePanelOnEsc(e, {
        rule,
        key: panel.key,
        focusedKey: focusedPanelKey(),
        nestedFocus: focusInNestedPanel(panel.key),
        dialogOpen: document.querySelector("dialog[open], [role=menu]") !== null,
      });
      if (close) panel.close();
    },
    panel.panelOpen && rule !== false,
  );
  useWindowEvent(
    "keydown",
    (e) => {
      if (!isSplitKey(e) || focusedPanelKey() !== panel.key) return;
      e.preventDefault();
      splitShownTab(panel.key, "row");
    },
    panel.panelOpen,
  );
}

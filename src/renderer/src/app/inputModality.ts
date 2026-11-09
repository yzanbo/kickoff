import { isFocusRingKey } from "@/lib/keys";

/**
 * いまの操作がマウス（指・ペン）か、キーボードか（`<html data-modality="pointer|keyboard">`）。ピントの枠の CSS が読む（styles/base/focus.css）。
 * ブラウザの :focus-visible は、マウスで押したボタンにピントがあるまま Shift（⌘ なども）を押しただけでキーボードの操作とみなして枠を出すので
 * （利用者の指摘。サイドバーのビューのタブを押したあと、Shift を押すと枠が出た）、修飾キーだけ・ショートカットではキーボードに切り替えない。
 * 押すまで（起動した直後）は付けず、ブラウザの決め方のまま
 */
export function startInputModality() {
  const root = document.documentElement;
  const set = (modality: "pointer" | "keyboard") => {
    if (root.dataset.modality !== modality) root.dataset.modality = modality;
  };
  window.addEventListener("pointerdown", () => set("pointer"), true);
  window.addEventListener("keydown", (e) => isFocusRingKey(e) && set("keyboard"), true);
}

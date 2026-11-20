// いま画面に出ているテーマ（<html data-theme>）を読む・見張る（React に依存しない。テーマを決めて出すのは app/theme.ts）
import { createSignal } from "@/foundation/ui/store";

/** いま画面に出ているテーマ（「システムに合わせる」も、ダーク・ライトのどちらかにしたもの） */
export type AppliedTheme = "dark" | "light";

export const readAppliedTheme = (): AppliedTheme => (document.documentElement.dataset.theme === "light" ? "light" : "dark");

// 見ている部品がいくつあっても、<html> の見張りは 1 つにする（ファイルの一覧の行ごとに使うため）
const themeChanged = createSignal();
let watchers = 0;
let themeObserver: MutationObserver | undefined;

/** <html data-theme> が変わったら知らせる。戻り値で見張りをやめる */
export function subscribeAppliedTheme(onChange: () => void) {
  const off = themeChanged.subscribe(onChange);
  watchers++;
  if (!themeObserver) {
    themeObserver = new MutationObserver(() => themeChanged.emit());
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  }
  let stopped = false;
  return () => {
    if (stopped) return;
    stopped = true;
    off();
    if (--watchers === 0) {
      themeObserver?.disconnect();
      themeObserver = undefined;
    }
  };
}

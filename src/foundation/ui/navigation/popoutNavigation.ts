// 別ウィンドウの中で画面を移る操作を、メインのウィンドウで行う（別ウィンドウには画面がないため。サイドバーの別ウィンドウの行・リンクなど）。
// App のダイアログ（設定・⌘⇧A・新しいプロジェクトなど）は @/foundation/ui/shell/points.ts の openAppDialog がメインのウィンドウへ送る
import { useWindowEvent } from "@/foundation/ui/hooks/useWindowEvent";
import { open } from "./open";
import { parsePopout, popoutPath, type PopoutRoute } from "./popout";
import { navigate, parse } from "./router";
import { onWindowMessage, postToMainWindow } from "./windowBus";

declare module "./windowBus" {
  interface WindowMessageMap {
    /** メインのウィンドウでその画面（URL のハッシュ）を開く（別ウィンドウの中のリンク・サイドバーの行） */
    navigate: { hash: string };
  }
}

/**
 * URL のハッシュが変わったとき、メインのウィンドウで開く画面（別ウィンドウの行き先でなくなったら、その画面。別ウィンドウの行き先のままなら null）。
 * restore は別ウィンドウの URL に戻す先（変わる前の URL が別ウィンドウの行き先ならそれ、なければ開いたときの行き先）
 */
export function forwardedNavigation(hash: string, oldHash: string, route: PopoutRoute): { hash: string; restore: string } | null {
  if (parsePopout(hash)) return null;
  return { hash, restore: parsePopout(oldHash) ? oldHash : `#${popoutPath(route)}` };
}

/** 別ウィンドウ: 画面を移る操作（リンク・navigate・location.hash）を、メインのウィンドウへ渡す（このウィンドウの中身は変えない） */
export function usePopoutForwarding(route: PopoutRoute) {
  useWindowEvent("hashchange", (e) => {
    const next = forwardedNavigation(location.hash, e.oldURL ? new URL(e.oldURL).hash : "", route);
    if (!next) return;
    history.replaceState(null, "", next.restore);
    postToMainWindow("navigate", { hash: next.hash });
  });
}

/** メインのウィンドウ: 別ウィンドウから渡された行き先・画面を開く。やめるときは返り値を呼ぶ */
export function receiveForwarded(): () => void {
  const offs = [onWindowMessage("open", (m) => void open(m.target, m.options)), onWindowMessage("navigate", (m) => navigate(parse(m.hash)))];
  return () => {
    for (const off of offs) off();
  };
}

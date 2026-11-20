import { useEffect, useMemo, useState } from "react";
import { parse, type Route } from "./router";
import { onWindowMessage } from "./windowBus";
import { useLatest } from "@/foundation/ui/hooks/useLatest";
import { useWindowEvent } from "@/foundation/ui/hooks/useWindowEvent";

declare module "./windowBus" {
  interface WindowMessageMap {
    /** メインのウィンドウのいまの画面（サイドバー・チャット欄の別ウィンドウが、開いているチャット・プロジェクトを強調するのに使う） */
    mainRoute: { hash: string };
    /** メインのウィンドウが起動した（読み込み直した）。サイドバー・チャット欄の別ウィンドウは開いていると知らせ直す */
    mainWindowReady: null;
  }
}

/**
 * サイドバー・チャット欄の別ウィンドウ: メインのウィンドウのいまの画面（届くまでは全プロジェクト）。開いている間、announce でメインのウィンドウに開いていると知らせ
 * （開いた・メインのウィンドウが読み込み直した）、ウィンドウを閉じたら閉じたと知らせる。画面は mainRoute で届く（app/popoutHosts.ts）
 */
export function useMainWindowRoute(announce: (open: boolean) => void): Route {
  const [hash, setHash] = useState("#/");
  const latest = useLatest(announce);
  useEffect(() => {
    const offRoute = onWindowMessage("mainRoute", (m) => setHash(m.hash));
    // メインのウィンドウが読み込み直したら、開いていると知らせ直す
    const offReady = onWindowMessage("mainWindowReady", () => latest.current(true));
    latest.current(true);
    return () => {
      offRoute();
      offReady();
    };
  }, []);
  // ウィンドウを閉じた・読み込み直した（閉じたと知らせるのはここだけ。effect の片付けはウィンドウを閉じても流れず、
  // 開発時の StrictMode では描いた直後にも流れて「閉じた → 開いた」が届き、チャット欄を渡し直すことになる）
  useWindowEvent("pagehide", () => latest.current(false));
  return useMemo(() => parse(hash), [hash]);
}

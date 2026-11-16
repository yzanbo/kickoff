import { useEffect, useMemo, useState } from "react";
import { parse, type Route } from "@/app/router";
import { subscribeWindowMessages } from "@/app/windowBus";
import { useLatest } from "@/hooks/useLatest";
import { useWindowEvent } from "@/hooks/useWindowEvent";

/**
 * サイドバー・チャット欄の別ウィンドウ: メインのウィンドウのいまの画面（届くまでは全プロジェクト）。開いている間、announce でメインのウィンドウに開いていると知らせ
 * （開いた・メインのウィンドウが読み込み直した）、ウィンドウを閉じたら閉じたと知らせる。画面は mainRoute で届く（app/popoutHosts.ts）
 */
export function useMainWindowRoute(announce: (open: boolean) => void): Route {
  const [hash, setHash] = useState("#/");
  const latest = useLatest(announce);
  useEffect(() => {
    const off = subscribeWindowMessages((m) => {
      if (m.type === "mainRoute") setHash(m.hash);
      // メインのウィンドウが読み込み直したら、開いていると知らせ直す
      else if (m.type === "mainWindowReady") latest.current(true);
    });
    latest.current(true);
    return off;
  }, []);
  // ウィンドウを閉じた・読み込み直した（閉じたと知らせるのはここだけ。effect の片付けはウィンドウを閉じても流れず、
  // 開発時の StrictMode では描いた直後にも流れて「閉じた → 開いた」が届き、チャット欄を渡し直すことになる）
  useWindowEvent("pagehide", () => latest.current(false));
  return useMemo(() => parse(hash), [hash]);
}

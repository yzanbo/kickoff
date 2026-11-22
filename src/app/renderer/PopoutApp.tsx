import { useLayoutEffect, useRef, type ComponentType } from "react";
import { bootMark } from "@/foundation/ui/lib/bootMarks";
import { useUserViewReport } from "@/features/userView/ui/userViewReport";
import { collectPopoutView, popoutChatIds } from "@/features/userView/ui/userViewCollect";
import { useServerConnection } from "@/foundation/ui/api/serverConnection";
import { HoverTip } from "@/foundation/ui/kit/HoverTip";
import { runPageFind } from "@/foundation/ui/kit/pageFind";
import { usePageFind } from "@/foundation/ui/kit/usePageFind";
import { useWindowEvent } from "@/foundation/ui/hooks/useWindowEvent";
import { isKey } from "@/foundation/ui/lib/keys";
import { saveAll } from "@/foundation/ui/document/unsaved";
import { openEditorFind } from "@/foundation/ui/code/editorFind";
import { NoteProgress } from "@/features/notes/ui/NoteProgress";
import { ToastHost } from "@/foundation/ui/kit/toast";
import { CoreStatusBand } from "@/features/diagnostics/ui/CoreStatusBand";
import { AskHost } from "@/foundation/ui/kit/AskHost";
import { LinkOpenerProvider } from "@/foundation/ui/external/LinkOpenerProvider";
import { DbUnlockHost } from "@/features/database/ui/DbUnlockHost";
import { useApplyChatFontSize } from "@/features/conversation/ui/screen/chatFontSize";
import { PopoutDockButton } from "@/foundation/ui/navigation/PopoutDockButton";
import { GitHubDialogHost } from "@/features/github/ui/GitHubDialogHost";
import { popoutKindOf, type PopoutKind, type PopoutRoute } from "@/foundation/ui/navigation/popout";
import { usePopoutForwarding } from "@/foundation/ui/navigation/popoutNavigation";
import { useCommandShortcuts } from "@/foundation/ui/commands";
import { useAgentBrowserBridge } from "@/features/browser/ui/agentBrowser";

/**
 * 別ウィンドウ（チャットの画面の右の欄の変更・ファイル・サブエージェント・子チャット・ノート・DB クライアントと左のサイドバー）の画面。メインのウィンドウの App は使わない
 * （サイドバー・通知・ショートカット・下の帯などを 2 つ動かさないため）。サーバーとのつながり・回答待ち・プロジェクトの色・会話の文字の大きさだけを持つ。
 * 表示の設定は localStorage をメインのウィンドウと共有し、書き換えは storage の知らせでそろう（lib/storage）。
 * ⌘F は、ウィンドウの中を探す（ファイル・ノートはエディタの検索、ほかは右上の検索の欄。子チャットはチャットの中の検索が先に受け取る）
 */
export function PopoutApp({ route }: { route: PopoutRoute }) {
  // 種類の項目（札・中身・上の帯を描くか・⌘F。持ち主の機能が popoutKinds に登録する）
  const kind = popoutKindOf(route.kind) as PopoutKind | undefined;
  const Page = kind?.Page as ComponentType<{ route: PopoutRoute }> | undefined;
  // 最初の描き終わり（起動の時刻の記録。app/bootMarks.ts）
  useLayoutEffect(() => bootMark("firstCommit"), []);
  useServerConnection();
  useApplyChatFontSize();
  // 中で画面を移る操作（リンク・サイドバーの行）は、メインのウィンドウで開く（設定・⌘⇧A などのダイアログは openAppDialog がメインへ送る）
  usePopoutForwarding(route);
  // AI（kickoff_browser）が埋め込みブラウザのタブを開く・表に出す・操作している印（チャット欄・ブラウザのタブの別ウィンドウ。ほかのウィンドウでは受け持たずに断る）
  useAgentBrowserBridge();
  // 利用者が見ているもの（このウィンドウの中身。AI の get_user_view が読む）
  useUserViewReport(() => collectPopoutView(route), (view) => popoutChatIds(view, route), [route]);
  // 機能が commands に入れたショートカットのうち、別ウィンドウでも効くもの
  useCommandShortcuts("popout");
  const rootRef = useRef<HTMLDivElement>(null);
  const find = usePageFind(rootRef, { native: openEditorFind, placeholder: "このウィンドウを検索", className: "page-find", enabled: kind?.find !== false });
  useWindowEvent("keydown", (e) => {
    if (e.defaultPrevented) return;
    // ⌘⇧S: すべて保存（このウィンドウのノート・ファイル。メインのウィンドウと同じ）
    if (isKey(e, "s", { meta: true, shift: true }) || isKey(e, "s", { ctrl: true, shift: true })) {
      e.preventDefault();
      void saveAll();
      return;
    }
    if (!(isKey(e, "f", { meta: true }) || isKey(e, "f", { ctrl: true }))) return;
    if (runPageFind()) e.preventDefault();
  });
  return (
    // URL は別ウィンドウの行き先なので、画面の URL として購読しない（useHashRoute は見ている画面を shell:last-route に覚えるので、
    // 別ウィンドウを開くたびに「最後に見ていた画面」が全プロジェクトに上書きされる）。useRoute() は初めの値（全プロジェクト）
    <>
        {/* 外部リンクは確かめてから開く。別ウィンドウには Kickoff のブラウザのタブの置き場がないので、開き先は既定のブラウザ */}
        <LinkOpenerProvider projectId={undefined}>
        <div ref={rootRef} className="popout">
          {find}
          {kind?.bar !== false && (
            // 上の細い帯（子チャットは自分の帯に同じボタンを置く）
            <div className="popout-bar">
              <span className="popout-bar-label">{kind?.label}</span>
              <span className="spacer" />
              <PopoutDockButton route={route} />
            </div>
          )}
          {Page && <Page route={route} />}
        </div>
        </LinkOpenerProvider>
        <HoverTip />
        <NoteProgress />
        <ToastHost />
        <CoreStatusBand />
        {/* GitHub の新しい issue・マージの確認（GitHub タブとノート・チャットの「issue にする」から） */}
        <GitHubDialogHost />
        <DbUnlockHost />
        <AskHost />
    </>
  );
}

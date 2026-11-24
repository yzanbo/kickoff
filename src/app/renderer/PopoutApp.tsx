import "./PopoutApp.css";
import { useLayoutEffect, useRef, type ComponentType } from "react";
import { bootMark } from "@/foundation/ui/lib/bootMarks";
import { useServerConnection } from "@/foundation/ui/api/serverConnection";
import { usePageFind } from "@/foundation/ui/kit/usePageFind";
import { openEditorFind } from "@/foundation/ui/code/editorFind";
import { PopoutDockButton } from "@/foundation/ui/navigation/PopoutDockButton";
import { popoutKindOf, type PopoutKind, type PopoutRoute } from "@/foundation/ui/navigation/popout";
import { usePopoutForwarding } from "@/foundation/ui/navigation/popoutNavigation";
import { AppHosts, AppShell } from "@/foundation/ui/shell/AppShell";

/**
 * 別ウィンドウ（チャットの画面の右の欄の変更・ファイル・サブエージェント・子チャット・ノート・DB クライアントと左のサイドバー）の画面。メインのウィンドウの App は使わない
 * （サイドバー・通知・下の帯などを 2 つ動かさないため）。殻（AppShell）は別ウィンドウにも置くと決めた物（appHosts の windows）だけを置く。
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
  // 中で画面を移る操作（リンク・サイドバーの行）は、メインのウィンドウで開く（設定・⌘⇧A などのダイアログは openAppDialog がメインへ送る）
  usePopoutForwarding(route);
  const rootRef = useRef<HTMLDivElement>(null);
  const find = usePageFind(rootRef, { native: openEditorFind, placeholder: "このウィンドウを検索", className: "page-find", enabled: kind?.find !== false });
  return (
    // URL は別ウィンドウの行き先なので、画面の URL として購読しない（useHashRoute は見ている画面を shell:last-route に覚えるので、
    // 別ウィンドウを開くたびに「最後に見ていた画面」が全プロジェクトに上書きされる）。useRoute() は初めの値（全プロジェクト）
    <>
        {/* 外部リンクは確かめてから開く。別ウィンドウには Kickoff のブラウザのタブの置き場がないので、開き先は既定のブラウザ。
            ショートカットは、機能が commands に入れたもののうち別ウィンドウでも効くもの（⌘F = page.find・⌘⇧S = document.saveAll など） */}
        <AppShell window="popout" projectId={undefined}>
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
        </AppShell>
        <AppHosts window="popout" />
    </>
  );
}

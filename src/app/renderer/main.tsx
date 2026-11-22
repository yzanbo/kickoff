import { bootMark, expectInteractive, startMemoryReports } from "@/foundation/ui/lib/bootMarks";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { prepareStorage } from "@/foundation/ui/storage/prepareStorage";
import { STORAGE_GROUPS } from "./storage";
import { startInputModality } from "@/foundation/ui/lib/inputModality";
import { startDragAutoScroll } from "@/foundation/ui/lib/dragAutoScroll";
import { startTheme } from "@/foundation/ui/theme/theme";
import "@/app/renderer/styles/index.css";

// 起動の時刻の記録（app/bootMarks.ts。デスクトップアプリだけ、そろったらメインへ送る）
bootMark("entry");

// 入力欄以外にファイルを落としたとき、ウィンドウがそのファイルを開いてしまわないようにする
window.addEventListener("dragover", (e) => e.preventDefault());
window.addEventListener("drop", (e) => e.preventDefault());

// ドラッグ中に、スクロールできる欄の端へ寄せたらスクロールする（見えている範囲の外へも落とせるように。app/dragAutoScroll.ts）
startDragAutoScroll();

// マウスで操作したあとは、修飾キーだけではピントの枠を出さない（app/inputModality.ts）
startInputModality();

// テーマは先に出す（ID を含まないので、表示の設定を整えるのを待たない。待つ間に違う色で光らないように）
startTheme();

// 保存した表示の設定を整えてから（全部の機能の群に宣言していないキーを消し、DB を作り直していれば ID を含むものを捨ててから）、画面の部品を読み込んで描く
// （App は動的に読み込む: 部品の中には、読み込んだときに保存した値を読むもの（下書きのタブなど）があるため）
void prepareStorage(STORAGE_GROUPS)
  .catch((e: unknown) => console.error("[storage] 表示の設定を整えられませんでした", e))
  .then(async () => {
    bootMark("storageReady");
    // 拡張点に全部の機能の項目を入れる（別ウィンドウの種類の解析と、App が読む保存の読み戻しより前。機能のモジュールは片付けのあとに読む）
    const { installRegistry } = await import("./registry");
    installRegistry();
    // チャットの店にサーバーの知らせを当て始める（部品の hook より先に受ける。別ウィンドウも同じ）
    const { startChatStore } = await import("@/features/chat/ui/store/useChatStore");
    startChatStore();
    // 回答待ちの店は読む部品の有無に関係なく起動したときから読む（一覧の印・チャットの見出し・会話の欄がここから引く）
    const { startApprovals } = await import("@/features/chat/ui/store/approvals");
    startApprovals();
    const { startCurrentWork } = await import("@/features/chat/ui/currentWorkStore");
    startCurrentWork();
    // 別ウィンドウから頼まれた下書きへの足し込みと、消したチャットの下書きの片付けを受ける
    const { startComposerDrafts } = await import("@/features/composer/ui");
    startComposerDrafts();
    const root = createRoot(document.getElementById("root")!);
    // 別ウィンドウ（右の欄の変更・ファイル・サブエージェント）は、メインの App ではなく、その中身だけの画面を描く
    const { parsePopout } = await import("@/foundation/ui/navigation/popout");
    const popout = parsePopout(location.hash);
    if (popout) {
      const { PopoutApp } = await import("./PopoutApp");
      bootMark("appImported");
      // 別ウィンドウは最初の描き終わりのあとの描画を入力できる時刻とみなす
      expectInteractive("popout", []);
      startMemoryReports("popout");
      root.render(
        <StrictMode>
          <PopoutApp route={popout} />
        </StrictMode>,
      );
      return;
    }
    // 前回見ていた画面から開く（URL に画面の指定がないとき）
    const { parse, restoreLastRoute } = await import("@/foundation/ui/navigation/router");
    restoreLastRoute();
    const { App } = await import("./App");
    bootMark("appImported");
    // 入力できる = サイドバーの一覧が描けた（チャットの画面から開くなら、入力欄も置かれた）
    const first = parse(location.hash).name;
    expectInteractive("main", first === "chat" || first === "newChat" ? ["sidebar", "composer"] : ["sidebar"]);
    startMemoryReports("main");
    root.render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
  });

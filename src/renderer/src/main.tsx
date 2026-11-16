import { bootMark, expectInteractive, startMemoryReports } from "@/app/bootMarks";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { prepareStorage } from "@/app/prepareStorage";
import { startInputModality } from "@/app/inputModality";
import { startDragAutoScroll } from "@/app/dragAutoScroll";
import { startTheme } from "@/app/theme";
import "@/styles/index.css";

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

// 保存した表示の設定を整えてから（DB を作り直していれば、ID を含むものを捨ててから）、画面の部品を読み込んで描く
// （App は動的に読み込む: 部品の中には、読み込んだときに保存した値を読むもの（下書きのタブなど）があるため）
void prepareStorage()
  .catch((e: unknown) => console.error("[storage] 表示の設定を整えられませんでした", e))
  .then(async () => {
    bootMark("storageReady");
    const root = createRoot(document.getElementById("root")!);
    // 別ウィンドウ（右の欄の変更・ファイル・サブエージェント）は、メインの App ではなく、その中身だけの画面を描く
    const { parsePopout } = await import("@/app/popout");
    const popout = parsePopout(location.hash);
    if (popout) {
      const { PopoutApp } = await import("@/app/PopoutApp");
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
    const { parse, restoreLastRoute } = await import("@/app/router");
    restoreLastRoute();
    const { App } = await import("@/app/App");
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

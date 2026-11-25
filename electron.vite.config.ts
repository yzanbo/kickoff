import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig } from "electron-vite";
import babel from "@rolldown/plugin-babel";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import { APP_ENVS } from "./src/foundation/core/system/appEnv";
import { speechHelper } from "./scripts/speech-helper";
import { unhashedAssets } from "./src/foundation/core/http/rendererCache";
import { reactCompilerReport } from "./scripts/react-compiler-report.mjs";

// コアの API サーバーのポート（開発時は Vite から /api をここへ転送する。開発用のポート: appEnv.ts）
const corePort = Number(process.env.KICKOFF_PORT ?? APP_ENVS.development.port);

// import のエイリアス（tsconfig.base.json の paths と同じ）。どのプロセスも @shared と @ を使う
const alias = { "@shared": resolve("src/shared"), "@": resolve("src") };

/**
 * 画面のビルドの終わりに、out/renderer/assets のファイルがすべて名前に中身のハッシュを持つかを確かめ、外れがあればビルドを失敗にする
 * （コアは /assets/ の下を 1 年・変わらないとして配る。ハッシュのないファイルが入ると、入れ替えたあとも古い中身を使い続ける。src/foundation/core/http/rendererCache.ts）
 */
function hashedAssetsOnly() {
  return {
    name: "kickoff-hashed-assets",
    apply: "build" as const,
    writeBundle(options: { dir?: string }) {
      const bad = unhashedAssets(readdirSync(resolve(options.dir ?? "out/renderer", "assets")));
      if (bad.length) throw new Error(`out/renderer/assets に、名前に中身のハッシュがないファイルがあります（public/assets/ に置かない）: ${bad.join(", ")}`);
    },
  };
}

// React Compiler（部品・hooks の値と描いた結果を自動で覚え、変わっていない所を描き直さない）。
// 最適化できなかった部品・hooks は報告にまとめ、許した一覧にないものが増えたらビルドを止める（scripts/react-compiler-report.mjs）。
// Vitest（vitest.config.ts）には入れない（画面のテストは純粋な関数だけで、通しても確かめるものが増えず遅くなるだけのため）
const compilerReport = reactCompilerReport({ allowList: "src/app/renderer/react-compiler-skips.json" });

export default defineConfig({
  main: {
    resolve: { alias },
    // 音声入力の「macOS の音声認識」の補助コマンドも一緒に作る（out/native）
    plugins: [speechHelper()],
    build: {
      outDir: "out/main",
      // コアのプロセス（out/main/core.js。メインが utilityProcess で起動する）と
      // DB クライアントの DB ワーカー（out/main/dbWorker.js。メインが作り、コアと直結する）もメインプロセスと一緒に作る
      rolldownOptions: {
        input: { index: resolve("src/app/desktop/index.ts"), core: resolve("src/app/core/hostMain.ts"), dbWorker: resolve("src/features/database/worker/main.ts") },
      },
    },
  },
  preload: {
    resolve: { alias },
    build: {
      outDir: "out/preload",
      // サンドボックス化した preload は CommonJS である必要がある。入口は electron-vite の既定の場所にないので書く
      rolldownOptions: { input: { index: resolve("src/app/desktop/preload.ts") }, output: { format: "cjs", entryFileNames: "[name].cjs" } },
    },
  },
  renderer: {
    root: resolve("src/app/renderer"),
    resolve: { alias },
    plugins: [react(), babel({ presets: [reactCompilerPreset({ logger: compilerReport.logger })] }), compilerReport.plugin, hashedAssetsOnly()],
    // 入口の index.html は electron-vite の既定の場所にないので書く
    build: { outDir: resolve("out/renderer"), rolldownOptions: { input: { index: resolve("src/app/renderer/index.html") } } },
    // Worker（コードの色付け・Monaco）を ES モジュールで作る（色付けの言語の定義を使うときだけ読む別のファイルに分けるため。iife では 1 つに入り約 3MB になる）
    worker: { format: "es" },
    server: {
      proxy: {
        // ws: 内蔵ターミナルの WebSocket（/api/terminals/:key/ws）も転送する
        "/api": { target: `http://127.0.0.1:${corePort}`, changeOrigin: false, ws: true },
        // AI が返答に描いた図の枠のページ（コアが図だけの CSP で返す）
        "/visual-frame": { target: `http://127.0.0.1:${corePort}`, changeOrigin: false },
        // Markdown の Mermaid の図を描く閉じた枠のページ（コアが外へ読み込み・通信ができない CSP で返す）
        "/mermaid-frame": { target: `http://127.0.0.1:${corePort}`, changeOrigin: false },
      },
    },
  },
});

import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig } from "electron-vite";
import babel from "@rolldown/plugin-babel";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import { APP_ENVS } from "./src/core/system/appEnv";
import { speechHelper } from "./scripts/speech-helper";
import { unhashedAssets } from "./src/core/http/rendererCache";
import { reactCompilerReport } from "./scripts/react-compiler-report.mjs";

// コアの API サーバーのポート（開発時は Vite から /api をここへ転送する。開発用のポート: appEnv.ts）
const corePort = Number(process.env.KICKOFF_PORT ?? APP_ENVS.development.port);

// import のエイリアス（tsconfig.json の paths と同じ）。@shared はどのプロセスからも、@ は画面の中だけ
const shared = { "@shared": resolve("src/shared") };

/**
 * 画面のビルドの終わりに、out/renderer/assets のファイルがすべて名前に中身のハッシュを持つかを確かめ、外れがあればビルドを失敗にする
 * （コアは /assets/ の下を 1 年・変わらないとして配る。ハッシュのないファイルが入ると、入れ替えたあとも古い中身を使い続ける。src/core/http/rendererCache.ts）
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

// React Compiler（部品・hooks の値と描いた結果を自動で覚え、変わっていない所を描き直さない。メモの仕様書「0023_表示を軽くする」の案 17）。
// 最適化できなかった部品・hooks は報告にまとめ、許した一覧にないものが増えたらビルドを止める（scripts/react-compiler-report.mjs）。
// Vitest（vitest.config.ts）には入れない（画面のテストは純粋な関数だけで、通しても確かめるものが増えず遅くなるだけのため）
const compilerReport = reactCompilerReport({ allowList: "src/renderer/react-compiler-skips.json" });

export default defineConfig({
  main: {
    resolve: { alias: shared },
    // 音声入力の「macOS の音声認識」の補助コマンドも一緒に作る（out/native）
    plugins: [speechHelper()],
    build: {
      outDir: "out/main",
      // コアのプロセス（out/main/core.js。メインが utilityProcess で起動する。メモの仕様書「0023_表示を軽くする」の案 16）と
      // DB クライアントの DB ワーカー（out/main/dbWorker.js。メインが作り、コアと直結する）もメインプロセスと一緒に作る
      rolldownOptions: {
        input: { index: resolve("src/main/index.ts"), core: resolve("src/core/host/main.ts"), dbWorker: resolve("src/core/databases/worker/main.ts") },
      },
    },
  },
  preload: {
    resolve: { alias: shared },
    build: {
      outDir: "out/preload",
      // サンドボックス化した preload は CommonJS である必要がある
      rolldownOptions: { output: { format: "cjs", entryFileNames: "[name].cjs" } },
    },
  },
  renderer: {
    root: resolve("src/renderer"),
    resolve: { alias: { ...shared, "@": resolve("src/renderer/src") } },
    plugins: [react(), babel({ presets: [reactCompilerPreset({ logger: compilerReport.logger })] }), compilerReport.plugin, hashedAssetsOnly()],
    build: { outDir: resolve("out/renderer") },
    // Worker（コードの色付け・Monaco）を ES モジュールで作る（色付けの言語の定義を使うときだけ読む別のファイルに分けるため。iife では 1 つに入り約 3MB になる）
    worker: { format: "es" },
    server: {
      proxy: {
        // ws: 内蔵ターミナルの WebSocket（/api/terminals/:key/ws）も転送する
        "/api": { target: `http://127.0.0.1:${corePort}`, changeOrigin: false, ws: true },
        // AI が返答に描いた図の枠のページ（コアが図だけの CSP で返す）
        "/visual-frame": { target: `http://127.0.0.1:${corePort}`, changeOrigin: false },
      },
    },
  },
});

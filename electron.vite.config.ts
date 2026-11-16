import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig } from "electron-vite";
import react from "@vitejs/plugin-react";
import { APP_ENVS } from "./src/core/system/appEnv";
import { speechHelper } from "./scripts/speech-helper";
import { unhashedAssets } from "./src/core/http/rendererCache";

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

export default defineConfig({
  main: {
    resolve: { alias: shared },
    // 音声入力の「macOS の音声認識」の補助コマンドも一緒に作る（out/native）
    plugins: [speechHelper()],
    build: {
      outDir: "out/main",
      // DB クライアントの DB ワーカー（コアが別のプロセスで起動する。out/main/dbWorker.js）もメインプロセスと一緒に作る
      rolldownOptions: { input: { index: resolve("src/main/index.ts"), dbWorker: resolve("src/core/databases/worker/main.ts") } },
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
    plugins: [react(), hashedAssetsOnly()],
    build: { outDir: resolve("out/renderer") },
    server: {
      proxy: {
        "/api": { target: `http://127.0.0.1:${corePort}`, changeOrigin: false },
        // AI が返答に描いた図の枠のページ（コアが図だけの CSP で返す）
        "/visual-frame": { target: `http://127.0.0.1:${corePort}`, changeOrigin: false },
      },
    },
  },
});

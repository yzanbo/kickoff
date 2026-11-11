import { resolve } from "node:path";
import { defineConfig } from "electron-vite";
import react from "@vitejs/plugin-react";
import { APP_ENVS } from "./src/core/system/appEnv";
import { speechHelper } from "./scripts/speech-helper";

// コアの API サーバーのポート（開発時は Vite から /api をここへ転送する。開発用のポート: appEnv.ts）
const corePort = Number(process.env.KICKOFF_PORT ?? APP_ENVS.development.port);

// import のエイリアス（tsconfig.json の paths と同じ）。@shared はどのプロセスからも、@ は画面の中だけ
const shared = { "@shared": resolve("src/shared") };

export default defineConfig({
  main: {
    resolve: { alias: shared },
    // 音声入力の「macOS の音声認識」の補助コマンドも一緒に作る（out/native）
    plugins: [speechHelper()],
    build: { outDir: "out/main" },
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
    plugins: [react()],
    build: { outDir: resolve("out/renderer") },
    server: {
      proxy: { "/api": { target: `http://127.0.0.1:${corePort}`, changeOrigin: false } },
    },
  },
});

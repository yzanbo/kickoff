import { resolve } from "node:path";
import { defineConfig } from "electron-vite";
import react from "@vitejs/plugin-react";
import { APP_ENVS } from "./src/core/appEnv";

// コアの API サーバーのポート（開発時は Vite から /api をここへ転送する。開発用のポート: appEnv.ts）
const corePort = Number(process.env.KICKOFF_PORT ?? APP_ENVS.development.port);

export default defineConfig({
  main: {
    build: { outDir: "out/main" },
  },
  preload: {
    build: {
      outDir: "out/preload",
      // サンドボックス化した preload は CommonJS である必要がある
      rolldownOptions: { output: { format: "cjs", entryFileNames: "[name].cjs" } },
    },
  },
  renderer: {
    root: resolve("src/renderer"),
    plugins: [react()],
    build: { outDir: resolve("out/renderer") },
    server: {
      proxy: { "/api": { target: `http://127.0.0.1:${corePort}`, changeOrigin: false } },
    },
  },
});

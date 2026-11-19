// テストの設定（Vitest）。
// 組は unit の 1 つ（DB のドライバの結合テストだけ別の組）。既定はプロセスを使い回す（isolate: false）で、
// ファイルごとに切り離すのはコマンドで --isolate を付ける（npm run test:isolated・test:changed:isolated）
import { fileURLToPath } from "node:url";
import { defineConfig, type TestProjectInlineConfiguration } from "vitest/config";

const alias = {
  "@shared": fileURLToPath(new URL("./src/shared", import.meta.url)),
  "@": fileURLToPath(new URL("./src", import.meta.url)),
};

/** どの組にも共通の設定（前のテストが残した値を戻す・時間の上限） */
const common = {
  setupFiles: ["./vitest.setup.ts"],
  // vi.stubGlobal・vi.stubEnv・モックで変えたものは、テストごとに元に戻す
  unstubGlobals: true,
  unstubEnvs: true,
  restoreMocks: true,
  // 本物の git・子プロセスを使うテストがあるので長めに
  testTimeout: 60_000,
  hookTimeout: 60_000,
};

const projects: TestProjectInlineConfiguration[] = [{ extends: true, test: { name: "unit", include: ["src/**/*.test.ts", "scripts/**/*.test.mjs", "mobile/src/**/*.test.ts"], ...common } }];
// DB のドライバの結合テストは、npm run test:db（scripts/test-db.mjs が Docker で DB を立てて KICKOFF_DBTEST を付ける）のときだけ
if (process.env.KICKOFF_DBTEST) projects.push({ extends: true, test: { name: "db", include: ["src/**/*.dbtest.ts"], fileParallelism: false, ...common } });

export default defineConfig({
  // スマホのフォルダの tsconfig は expo の設定を継ぐ（mobile/node_modules がないと読めない）ので、どのファイルもテストの tsconfig（tsconfig.test.json）で変換する
  tsconfig: "./tsconfig.test.json",
  resolve: { alias },
  test: {
    projects,
    isolate: false,
    // 同時に流すファイルは 6 つまで（12 コアのうち、2 つのチャットが重なっても収まる数）
    maxWorkers: 6,
  },
});

// すべてのテストの共通の準備（vitest.config.ts の setupFiles）。前のテストが残した値を、テストごとに元に戻す
import { afterEach, beforeEach, vi } from "vitest";

beforeEach(() => {
  // 画面のテストが置く Web Storage は、テストごとに空にする（置いていなければ何もしない）
  for (const name of ["localStorage", "sessionStorage"] as const) {
    const storage = (globalThis as Record<string, unknown>)[name] as Storage | undefined;
    storage?.clear?.();
  }
});

afterEach(() => {
  // 偽の時計を使ったテストのあとは本物に戻す
  vi.useRealTimers();
  // 差し替えたグローバル・環境変数もテストのあとに戻す（設定の unstubGlobals / unstubEnvs は次のテストの前に戻すので、ファイルの最後のテストで
  // 差し替えた値が、同じプロセスで続けて流す次のファイルを読み込む間も残り、読み込みのときに window を使うモジュール（features/group/groups.ts など）が
  // 仮の window で落ちた）
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

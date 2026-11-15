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
});

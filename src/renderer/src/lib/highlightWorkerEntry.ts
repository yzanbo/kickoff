// 色付けの Worker の薄い入口（?worker の import はここだけ。テストはこのファイルを読まない。Vitest の Node では Worker を作れないため）
import HighlightWorker from "./highlightWorker?worker";
import { createHighlightPool } from "./highlightPool";

/** 画面で使う色付けの待ち行列（Worker は 1 つ。初めて頼まれたときに作る） */
export const highlightPool = createHighlightPool({ spawn: () => new HighlightWorker() });

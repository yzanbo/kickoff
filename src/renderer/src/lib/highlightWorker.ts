// コードの色付けの Worker の入口（lib/highlightWorkerEntry.ts が ?worker で読み込む）。
// { id, code, lang, theme } を受けて色付けし、詰めて返す（詰められなければ断片のまま）。1 つずつ頼まれる（待ち行列と取り消しは画面の側 lib/highlightPool.ts）
import type { AppliedTheme } from "./appliedTheme";
import { computeLines } from "./highlightCore";
import { encodeTokens } from "./tokenCodec";
import type { HighlightReply, HighlightJob } from "./highlightPool";

interface WorkerScope {
  onmessage: ((e: MessageEvent<HighlightJob>) => void) | null;
  postMessage(message: HighlightReply, transfer?: Transferable[]): void;
}
const scope = self as unknown as WorkerScope;

scope.onmessage = (e) => {
  const { id, code, lang, theme } = e.data;
  computeLines(code, lang, theme as AppliedTheme).then(
    (lines) => {
      if (!lines) return scope.postMessage({ id, tokens: null });
      const encoded = encodeTokens(code, lines);
      if (encoded) scope.postMessage({ id, encoded }, [encoded.data.buffer]);
      else scope.postMessage({ id, tokens: lines });
    },
    () => scope.postMessage({ id, tokens: null, failed: true }),
  );
};

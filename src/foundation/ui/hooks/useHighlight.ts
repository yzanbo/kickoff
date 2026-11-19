import { useEffect, useMemo, useState } from "react";
import { highlightLines, peekHighlight, type CodeToken } from "@/foundation/ui/code/highlight";
import { useAppliedTheme } from "./useAppliedTheme";

/**
 * コードの行ごとの色（VS Code と同じ配色。ダーク・ライトに合わせる）。lang はファイルなら languageOf(パス) で決める。
 * 色を付けるまでと、色を付けない言語（undefined を含む）では undefined（そのあいだは色なしで出す）。
 * 覚えている結果は最初の描画から返す（窓で行が外れて戻ったときに、色なし → 色付きのちらつきにしない）。
 * near を渡すと、それが true になるまで（画面の手前まで来るまで。`useNearViewport`）色付けを頼まず、頼むときも見えているもの（near を渡さないもの）のあとにする。
 * 外したら・コードが替わったら、まだ始めていない色付けは取り消す
 */
export function useHighlight(lines: string[], lang: string | undefined, near?: boolean): CodeToken[][] | undefined {
  const theme = useAppliedTheme();
  const code = useMemo(() => lines.join("\n"), [lines]);
  const peeked = useMemo(() => peekHighlight(code, lang, theme), [code, lang, theme]);
  const [state, setState] = useState<{ code: string; lang: string | undefined; theme: string; tokens: CodeToken[][] | null }>();
  const waiting = near === false;
  const known = peeked !== undefined;

  useEffect(() => {
    if (waiting || known) return;
    let alive = true;
    const abort = new AbortController();
    const done = (tokens: CodeToken[][] | null) => alive && setState({ code, lang, theme, tokens });
    highlightLines(code, lang, theme, { priority: near === undefined ? "visible" : "near", signal: abort.signal }).then(done, () => done(null));
    return () => {
      alive = false;
      abort.abort();
    };
  }, [code, lang, theme, waiting, known, near]);

  if (state && state.code === code && state.lang === lang && state.theme === theme) return state.tokens ?? undefined;
  return peeked ?? undefined;
}

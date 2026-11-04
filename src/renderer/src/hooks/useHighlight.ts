import { useEffect, useMemo, useState } from "react";
import { highlightLines, type CodeToken } from "@/lib/highlight";
import { useAppliedTheme } from "@/hooks/useAppliedTheme";

/**
 * コードの行ごとの色（VS Code と同じ配色。ダーク・ライトに合わせる）。lang はファイルなら languageOf(パス) で決める。
 * 色を付けるまでと、色を付けない言語（undefined を含む）では undefined（そのあいだは色なしで出す）
 */
export function useHighlight(lines: string[], lang: string | undefined): CodeToken[][] | undefined {
  const theme = useAppliedTheme();
  const code = useMemo(() => lines.join("\n"), [lines]);
  const [state, setState] = useState<{ code: string; lang: string | undefined; theme: string; tokens: CodeToken[][] | null }>();

  useEffect(() => {
    let alive = true;
    const done = (tokens: CodeToken[][] | null) => alive && setState({ code, lang, theme, tokens });
    highlightLines(code, lang, theme).then(done, () => done(null));
    return () => {
      alive = false;
    };
  }, [code, lang, theme]);

  return state && state.code === code && state.lang === lang && state.theme === theme ? (state.tokens ?? undefined) : undefined;
}

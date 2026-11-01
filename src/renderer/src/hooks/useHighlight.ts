import { useEffect, useMemo, useState } from "react";
import { highlightLines, type CodeToken } from "../highlight";
import { useAppliedTheme } from "../theme";

/**
 * コードの行ごとの色（VS Code と同じ配色。ダーク・ライトに合わせる）。
 * 色を付けるまでと、色を付けない種類のファイルでは undefined（そのあいだは色なしで出す）
 */
export function useHighlight(lines: string[], path: string): CodeToken[][] | undefined {
  const theme = useAppliedTheme();
  const code = useMemo(() => lines.join("\n"), [lines]);
  const [state, setState] = useState<{ code: string; path: string; theme: string; tokens: CodeToken[][] | null }>();

  useEffect(() => {
    let alive = true;
    const done = (tokens: CodeToken[][] | null) => alive && setState({ code, path, theme, tokens });
    highlightLines(code, path, theme).then(done, () => done(null));
    return () => {
      alive = false;
    };
  }, [code, path, theme]);

  return state && state.code === code && state.path === path && state.theme === theme ? (state.tokens ?? undefined) : undefined;
}

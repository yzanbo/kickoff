import { Fragment, useMemo, useState, type ReactNode } from "react";
import { useHighlight } from "@/hooks/useHighlight";
import { languageOf } from "@/lib/languages";
import { CodeLine } from "@/ui/CodeLine";
import { HighlightedCode } from "@/ui/HighlightedCode";
import { parseNumberedLines, parseSearchLines, searchRuns, type NumberedLine, type SearchLine } from "./toolResultParse";

/** 閉じた状態で出す行数（残りは「… ほか n 行」を押すと出す。色付けも出す分だけ） */
const SHOWN_LINES = 60;

/** 長い一覧を初めは SHOWN_LINES 行に切り、「… ほか n 行」で残りを出す */
function useClipped<T>(items: T[]): { shown: T[]; more: ReactNode } {
  const [all, setAll] = useState(false);
  const hidden = all ? 0 : Math.max(0, items.length - SHOWN_LINES);
  const shown = useMemo(() => (hidden > 0 ? items.slice(0, SHOWN_LINES) : items), [items, hidden]);
  const more = hidden > 0 && (
    <button type="button" className="link-button bash-more" onClick={() => setAll(true)}>
      … ほか {hidden} 行
    </button>
  );
  return { shown, more };
}

/**
 * ツールの行のパス（フォルダは薄く、ファイル名は本文の色で。読む・検索・ファイルを変えるツールの行で共通）。
 * フォルダの「/」で終わるパスはフォルダの名前として出す
 */
export function ToolPath({ path }: { path: string }) {
  const cut = path.replace(/\/$/, "").lastIndexOf("/") + 1;
  return (
    <>
      {cut > 0 && <span className="tool-path-dir">{path.slice(0, cut)}</span>}
      <span className="tool-path-name">{path.slice(cut)}</span>
    </>
  );
}

/**
 * 検索の行の見出し: Grep は探す正規表現に正規表現の文法で色を付け、Glob はパターンをパスの形で出し、探した場所をパスの形で添える。
 * highlight が false の間（まとまりを開くまで）は色付けを始めない
 */
export function SearchTitle({ glob, pattern, path, highlight }: { glob: boolean; pattern: string; path: string; highlight: boolean }) {
  return (
    <>
      {glob ? <ToolPath path={pattern} /> : <HighlightedCode code={pattern} lang={highlight ? "regexp" : undefined} />}
      {path && (
        <span className="tool-search-where">
          {"（"}
          <ToolPath path={path} />
          {"）"}
        </span>
      )}
    </>
  );
}

/**
 * 読む（Read）の結果: 行番号を左の欄に分け、中身にファイルの言語で色を付ける（番号付きの形でなければ文字のまま）。
 * highlight が false の間（一度も開いていない）は色付けを始めない
 */
export function ReadResult({ content, path, highlight }: { content: string; path: string; highlight: boolean }) {
  const lines = useMemo(() => parseNumberedLines(content), [content]);
  if (!lines) return <pre className="tool-output">{content}</pre>;
  return <NumberedCode lines={lines} lang={highlight ? languageOf(path) : undefined} />;
}

function NumberedCode({ lines, lang }: { lines: NumberedLine[]; lang: string | undefined }) {
  const { shown, more } = useClipped(lines);
  const texts = useMemo(() => shown.map((l) => l.text), [shown]);
  const tokens = useHighlight(texts, lang);
  return (
    <div className="tool-code-block">
      <pre className="tool-output tool-code">
        {shown.map((line, i) => (
          <Fragment key={i}>
            {i > 0 && "\n"}
            <span className="tool-code-no">{line.no}</span>
            <CodeLine tokens={tokens?.[i]} text={line.text} />
          </Fragment>
        ))}
      </pre>
      {more}
    </div>
  );
}

/**
 * 検索（Grep・Glob）の結果: ファイルのパスはフォルダを薄く、見つかった行は「行番号」を分けてそのファイルの言語で色を付ける
 * （同じファイルの続いた行をまとめて色付けする searchRuns）。文脈の行（-A / -B / -C）は少し薄く。
 * mode は Grep の output_mode（Glob は undefined = パスの一覧）、path は探した場所（1 つのファイルを探したときの言語）
 */
export function SearchResult({ content, mode, path, highlight }: { content: string; mode: string | undefined; path: string | undefined; highlight: boolean }) {
  const lines = useMemo(() => parseSearchLines(content, mode), [content, mode]);
  const { shown, more } = useClipped(lines);
  const runs = useMemo(() => searchRuns(shown, path), [shown, path]);
  return (
    <div className="tool-code-block">
      <pre className="tool-output tool-code">
        {runs.map((run, i) => (
          <Fragment key={i}>
            {i > 0 && "\n"}
            <SearchRunLines lines={run.lines} lang={highlight ? run.lang : undefined} />
          </Fragment>
        ))}
      </pre>
      {more}
    </div>
  );
}

/** 同じファイルの続いた行（1 回で色を付ける） */
function SearchRunLines({ lines, lang }: { lines: SearchLine[]; lang: string | undefined }) {
  const texts = useMemo(() => lines.map((l) => (l.kind === "match" || l.kind === "context" ? l.text : "")), [lines]);
  const tokens = useHighlight(texts, lang);
  return lines.map((line, i) => (
    <Fragment key={i}>
      {i > 0 && "\n"}
      {line.kind === "note" ? (
        <span className="tool-code-note">{line.text}</span>
      ) : line.kind === "path" ? (
        <>
          <ToolPath path={line.path} />
          {line.count !== null && <span className="tool-code-no">{`:${line.count}`}</span>}
        </>
      ) : (
        <span className={line.kind === "context" ? "tool-code-context" : undefined}>
          {/* パスは薄く、すぐ後ろに行番号の欄（grep の「:」「-」は付けず、中身の頭をそろえる） */}
          {line.path && <span className="tool-path-dir tool-code-path">{line.path}</span>}
          <span className="tool-code-no">{line.no}</span>
          <CodeLine tokens={tokens?.[i]} text={line.text} />
        </span>
      )}
    </Fragment>
  ));
}

import { CaseSensitive, Regex, WholeWord } from "lucide-react";
import { useMemo, useState } from "react";
import type { SearchMatch } from "@shared/types";
import { cx } from "@/lib/cx";
import { isComposing } from "@/lib/keys";
import { baseName } from "@/lib/format";
import { Chevron } from "@/ui/Chevron";
import { ErrorText } from "@/ui/ErrorText";
import { IconButton, RefreshButton } from "@/ui/IconButton";
import { PathParts } from "@/ui/PathParts";
import { FileIcon } from "./FileIcon";
import { searchPattern, splitMatches } from "@shared/search/searchMatch";
import type { ProjectSearchController } from "./useProjectSearch";

interface Props {
  search: ProjectSearchController;
  /** 選んでいる結果（ファイルと行） */
  selected?: { path: string; line?: number };
  onSelect: (path: string, line: number) => void;
}

/**
 * 「検索」タブ（VS Code と同じ: 大文字と小文字の区別・単語単位・正規表現を切り替えて、ファイルの中を探す）。
 * 結果はファイルごとにまとめ、見つかった部分に印を付ける。行を選ぶと、そのファイルのその行を右に出す
 */
export function SearchView({ search, selected, onSelect }: Props) {
  const { result } = search;
  // 結果を出したときの探し方で印を付ける（打っている途中の文字ではなく）
  const pattern = useMemo(() => (result ? searchPattern(result.query) : null), [result]);
  const toggles = [
    { key: "case_sensitive", icon: CaseSensitive, label: "大文字と小文字を区別する" },
    { key: "whole_word", icon: WholeWord, label: "単語単位で探す" },
    { key: "regex", icon: Regex, label: "正規表現を使う" },
  ] as const;

  return (
    <>
      <header className="changes-head">
        <span className="changes-branch">検索</span>
        <span className="spacer" />
        <RefreshButton label="もう一度探す" busy={search.loading} disabled={!search.query} onClick={search.rerun} />
      </header>
      <div className="code-search-box">
        <input
          type="text"
          className="code-search-input"
          placeholder="検索"
          aria-label="ファイルの中を検索"
          autoFocus
          value={search.query}
          onChange={(e) => search.setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !isComposing(e) && search.rerun()}
        />
        {toggles.map(({ key, icon, label }) => (
          <IconButton
            key={key}
            icon={icon}
            label={label}
            size={15}
            className={cx("code-search-toggle", search.options[key] && "active")}
            aria-pressed={search.options[key]}
            onClick={() => search.toggle(key)}
          />
        ))}
      </div>
      <ErrorText message={search.error} className="code-search-message" />
      {result && search.query && (
        <p className="muted small code-search-message">
          {result.value.total === 0
            ? "見つかりませんでした。"
            : `${result.value.files.length} 個のファイルで ${result.value.total} 件${result.value.truncated ? "（多いため、途中までを表示しています）" : ""}`}
        </p>
      )}
      {search.query &&
        result?.value.files.map((file) => (
          <SearchFile key={file.path} path={file.path} matches={file.matches} pattern={pattern} selected={selected} onSelect={onSelect} />
        ))}
    </>
  );
}

/** 1 つのファイルの結果（見出しで開閉。見つかった数をバッジで出す） */
function SearchFile({
  path,
  matches,
  pattern,
  selected,
  onSelect,
}: {
  path: string;
  matches: SearchMatch[];
  pattern: RegExp | null;
  selected?: { path: string; line?: number };
  onSelect: (path: string, line: number) => void;
}) {
  const [open, setOpen] = useState(true);
  return (
    <section className="change-group">
      <button className="code-search-file" aria-expanded={open} title={path} onClick={() => setOpen(!open)}>
        <Chevron open={open} />
        <FileIcon name={baseName(path)} />
        <PathParts path={path} nameClass="change-name" dirClass="change-dir" />
        <span className="change-count">{matches.length}</span>
      </button>
      {open && (
        <ul className="change-files">
          {matches.map((match) => {
            const isSelected = selected?.path === path && selected.line === match.line;
            return (
              <li key={match.line}>
                <button
                  className={cx("code-search-row", isSelected && "selected")}
                  aria-current={isSelected || undefined}
                  title={`${match.line} 行目`}
                  onClick={() => onSelect(path, match.line)}
                >
                  {/* 行の頭の空白は省く（VS Code と同じ） */}
                  {splitMatches(match.text.trimStart(), pattern).map((part, i) =>
                    part.match ? (
                      <mark key={i} className="code-search-match">
                        {part.text}
                      </mark>
                    ) : (
                      <span key={i}>{part.text}</span>
                    ),
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

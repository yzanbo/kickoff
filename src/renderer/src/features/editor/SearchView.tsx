import { CaseSensitive, CaseUpper, ChevronDown, ChevronRight, ChevronsDownUp, ChevronsUpDown, Ellipsis, EyeOff, ListX, Regex, ReplaceAll, WholeWord } from "lucide-react";
import { useEffect, useState, type KeyboardEvent } from "react";
import { cx } from "@/lib/cx";
import { hasModifiers, isComposing, isKey } from "@/lib/keys";
import { ErrorText } from "@/ui/ErrorText";
import { IconButton, RefreshButton } from "@/ui/IconButton";
import { SearchResults } from "./SearchResults";
import { resultCounts } from "./searchHits";
import type { ProjectSearchController } from "./useProjectSearch";
import type { SearchReplaceController } from "./useSearchReplace";

interface Props {
  search: ProjectSearchController;
  replacer: SearchReplaceController;
  /** 選んでいる結果（ファイルと行） */
  selected?: { path: string; line?: number };
  onSelect: (path: string, line: number) => void;
}

/** オン・オフの切り替えのアイコンのボタン（入力欄の右） */
function Toggle({ icon, label, on, onClick }: { icon: typeof CaseSensitive; label: string; on: boolean; onClick: () => void }) {
  return <IconButton icon={icon} label={label} size={15} className={cx("code-search-toggle", on && "active")} aria-pressed={on} onClick={onClick} />;
}

/**
 * 「検索」タブ（VS Code と同じ）。検索の欄（大文字と小文字の区別・単語単位・正規表現。↑↓ で履歴）、▸ で開く置換の欄
 * （大文字と小文字を保持・すべて置換。⌘Enter でもすべて置換）、… で開く詳細（含める・除外するファイル。除外設定と .gitignore を使うかの切り替え）。
 * 見出しに、探し直す・すべて閉じる / 開く・結果を消す。結果（SearchResults）の行を選ぶと、そのファイルのその行を右に出す
 */
export function SearchView({ search, replacer, selected, onSelect }: Props) {
  const { result } = search;
  const counts = resultCounts(search.files);
  // 閉じているファイル（探し直したら、すべて開いた状態に戻す）
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  useEffect(() => setCollapsed(new Set()), [result]);
  const allCollapsed = search.files.length > 0 && search.files.every((f) => collapsed.has(f.path));
  const canReplace = !!result && counts.lines > 0 && !replacer.busy;

  const onSearchKey = (e: KeyboardEvent<HTMLInputElement>) => {
    // 修飾キーなしの Enter・↑↓ だけ（変換中は除く）
    if (isComposing(e) || !hasModifiers(e)) return;
    if (e.key === "Enter") search.rerun();
    else if ((e.key === "ArrowUp" || e.key === "ArrowDown") && search.stepHistory(e.key === "ArrowUp")) e.preventDefault();
  };

  return (
    <>
      <header className="changes-head">
        <span className="changes-branch">検索</span>
        <span className="spacer" />
        <RefreshButton label="もう一度探す" busy={search.loading} disabled={!search.query} onClick={search.rerun} />
        <IconButton
          icon={allCollapsed ? ChevronsUpDown : ChevronsDownUp}
          size={14}
          label={allCollapsed ? "すべて開く" : "すべて閉じる"}
          disabled={search.files.length === 0}
          onClick={() => setCollapsed(allCollapsed ? new Set() : new Set(search.files.map((f) => f.path)))}
        />
        <IconButton icon={ListX} size={14} label="検索の結果を消す" disabled={!search.query} onClick={search.clear} />
      </header>
      <div className="code-search-form">
        <IconButton
          icon={search.showReplace ? ChevronDown : ChevronRight}
          size={14}
          label={search.showReplace ? "置換を隠す" : "置換を表示"}
          className="code-search-replace-toggle"
          aria-expanded={search.showReplace}
          onClick={() => search.setShowReplace(!search.showReplace)}
        />
        <div className="code-search-fields">
          <div className="code-search-box">
            <input
              type="text"
              className="code-search-input"
              placeholder="検索"
              aria-label="ファイルの中を検索（↑↓ で履歴）"
              autoFocus
              value={search.query}
              onChange={(e) => search.setQuery(e.target.value)}
              onKeyDown={onSearchKey}
            />
            <Toggle icon={CaseSensitive} label="大文字と小文字を区別する" on={search.options.case_sensitive} onClick={() => search.toggle("case_sensitive")} />
            <Toggle icon={WholeWord} label="単語単位で探す" on={search.options.whole_word} onClick={() => search.toggle("whole_word")} />
            <Toggle icon={Regex} label="正規表現を使う（置換では $1 などで見つかった組を使える）" on={search.options.regex} onClick={() => search.toggle("regex")} />
          </div>
          {search.showReplace && (
            <div className="code-search-box">
              <input
                type="text"
                className="code-search-input"
                placeholder="置換"
                aria-label="置換する文字（⌘Enter ですべて置換）"
                value={search.replace}
                onChange={(e) => search.setReplace(e.target.value)}
                onKeyDown={(e) => {
                  if (isKey(e, "Enter", { meta: true }) && canReplace) replacer.replaceAll();
                }}
              />
              <Toggle icon={CaseUpper} label="大文字と小文字を保持する（FOO → BAR・Foo → Bar）" on={search.preserveCase} onClick={() => search.setPreserveCase(!search.preserveCase)} />
              <IconButton icon={ReplaceAll} size={15} label="すべて置換" keys="⌘Enter" className="code-search-toggle" disabled={!canReplace} onClick={replacer.replaceAll} />
            </div>
          )}
        </div>
      </div>
      <div className="code-search-details-toggle">
        <IconButton
          icon={Ellipsis}
          size={14}
          label="検索の詳細を切り替える（含める・除外するファイル）"
          className={cx(search.showDetails && "active")}
          aria-expanded={search.showDetails}
          onClick={() => search.setShowDetails(!search.showDetails)}
        />
      </div>
      {search.showDetails && (
        <div className="code-search-details">
          <label className="code-search-label">
            含めるファイル
            <span className="code-search-box">
              <input type="text" className="code-search-input" placeholder="例: *.ts, ./src/editor/" value={search.include} onChange={(e) => search.setInclude(e.target.value)} />
            </span>
          </label>
          <label className="code-search-label">
            除外するファイル
            <span className="code-search-box">
              <input type="text" className="code-search-input" placeholder="例: *.test.ts, dist/" value={search.exclude} onChange={(e) => search.setExclude(e.target.value)} />
              <Toggle
                icon={EyeOff}
                label="除外設定と .gitignore を使う（オフにすると、無視しているファイルも探す）"
                on={search.options.use_ignore}
                onClick={() => search.toggle("use_ignore")}
              />
            </span>
          </label>
        </div>
      )}
      <ErrorText message={search.error} className="code-search-message" />
      {replacer.last && (
        <p className="muted small code-search-message code-search-replaced" role="status">
          {replacer.last.message}
          {replacer.last.undo && (
            <button type="button" className="link-button" disabled={replacer.busy} onClick={replacer.undo}>
              元に戻す
            </button>
          )}
        </p>
      )}
      {result && search.query && (
        <p className="muted small code-search-message">
          {counts.lines === 0
            ? result.value.total === 0
              ? "見つかりませんでした。"
              : "すべて結果から外しました。"
            : `${counts.files} 個のファイルで ${counts.lines} 件${result.value.truncated ? "（多いため、途中までを表示しています）" : ""}`}
        </p>
      )}
      {search.query && result && (
        <SearchResults
          search={search}
          replacer={replacer}
          collapsed={collapsed}
          onToggleFile={(path) =>
            setCollapsed((prev) => {
              const next = new Set(prev);
              if (!next.delete(path)) next.add(path);
              return next;
            })
          }
          selected={selected}
          onSelect={onSelect}
        />
      )}
    </>
  );
}

import { useMemo, useState, type KeyboardEvent, type RefObject } from "react";
import type { Snippet } from "@shared/types";
import { snippetLabel } from "@shared/snippet/snippets";
import { useProjects } from "@/stores/projects";
import { cx } from "@/lib/cx";
import { consumeKey, isKey } from "@/lib/keys";
import { useListNavigation } from "@/hooks/useListNavigation";
import { Popover } from "@/ui/Popover";
import { SearchField } from "@/ui/SearchField";
import { scopeLabel } from "./snippetActions";

/** 名前と本文に検索語が入っているか（大文字・小文字は区別しない） */
function matches(snippet: Snippet, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return snippetLabel(snippet).toLowerCase().includes(q) || snippet.text.toLowerCase().includes(q);
}

/**
 * 帯の「一覧」で開く、このプロジェクトで使う定型文のすべて（帯は横に流れて一度に見えないため）。名前と本文で絞り込み、
 * ↑↓ で選んで Enter で入力欄に入れる・⌘Enter ですぐ送る（行の押し方も同じ: 押す = 入れる、⌘ を押しながら = 送る）。
 * 下に「追加」「定型文を管理」
 */
export function SnippetPicker({
  anchor,
  projectId,
  snippets,
  onInsert,
  onSend,
  onAdd,
  onManage,
  onClose,
}: {
  anchor: RefObject<HTMLElement | null>;
  projectId: number;
  snippets: Snippet[];
  onInsert: (snippet: Snippet) => void;
  onSend: (snippet: Snippet) => void;
  onAdd: () => void;
  onManage: () => void;
  onClose: () => void;
}) {
  const { projectName } = useProjects();
  const [query, setQuery] = useState("");
  const shown = useMemo(() => snippets.filter((s) => matches(s, query)), [snippets, query]);
  const pick = (snippet: Snippet | undefined, send: boolean) => {
    if (!snippet) return;
    onClose();
    if (send) onSend(snippet);
    else onInsert(snippet);
  };
  const nav = useListNavigation(shown, (s) => pick(s, false));
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (isKey(e, "Enter", { meta: true })) {
      consumeKey(e);
      pick(shown[nav.index], true);
    } else nav.onKeyDown(e);
  };
  return (
    <Popover anchor={anchor} side="above" align="end" label="定型文の一覧" title={`定型文 ${snippets.length} 件`} className="snippet-picker" onClose={onClose}>
      {snippets.length > 0 && (
        <SearchField
          value={query}
          onChange={(v) => {
            setQuery(v);
            nav.setIndex(0);
          }}
          placeholder="名前・本文で絞り込む"
          label="定型文を絞り込む"
          autoFocus
          onKeyDown={onKeyDown}
        />
      )}
      <div className="snippet-picker-list" role="listbox" aria-label="定型文">
        {shown.map((s, i) => (
          <button
            key={s.id}
            type="button"
            role="option"
            aria-selected={i === nav.index}
            className={cx("snippet-picker-row", i === nav.index && "active")}
            title="押すと入力欄に入れます（⌘クリックですぐ送ります）"
            onMouseEnter={() => nav.setIndex(i)}
            onClick={(e) => pick(s, e.metaKey)}
          >
            <span className="snippet-picker-title">
              <span className="snippet-picker-name">{snippetLabel(s)}</span>
              <span className={cx("snippet-scope", s.project_id === null && "common")}>{scopeLabel(s, (id) => projectName(id) || undefined, projectId)}</span>
            </span>
            <span className="snippet-picker-text">{s.text}</span>
          </button>
        ))}
        {snippets.length === 0 && (
          <p className="muted small snippet-picker-empty">定型文はまだありません。よく送る指示を足しておくと、押すだけで入力欄に入れられます。</p>
        )}
        {snippets.length > 0 && shown.length === 0 && <p className="muted small snippet-picker-empty">「{query.trim()}」に合う定型文はありません。</p>}
      </div>
      <div className="snippet-picker-foot">
        <span className="muted small">Enter で入れる・⌘Enter で送る</span>
        <span className="snippet-picker-actions">
          <button
            type="button"
            className="btn"
            onClick={() => {
              onClose();
              onAdd();
            }}
          >
            追加
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => {
              onClose();
              onManage();
            }}
          >
            定型文を管理
          </button>
        </span>
      </div>
    </Popover>
  );
}

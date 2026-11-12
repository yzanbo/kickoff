import { useEffect, useState, type MouseEvent } from "react";
import { Check, ChevronDown, X } from "lucide-react";
import {
  GITHUB_KIND_LABELS,
  GITHUB_KINDS,
  GITHUB_MINE_FILTER_LABELS,
  GITHUB_SORT_LABELS,
  GITHUB_SORTS,
  GITHUB_STATE_FILTER_LABELS,
  GITHUB_STATE_FILTERS,
  type GitHubKind,
  type GitHubListFilter,
  type GitHubMineFilter,
  type GitHubRepoMeta,
} from "@shared/types";
import { defaultGitHubFilter, mineFiltersFor } from "@shared/github/searchQuery";
import { cx } from "@/lib/cx";
import { activeFilterCount } from "@/lib/githubFilters";
import { isComposing } from "@/lib/keys";
import { MenuItem, PopupMenu } from "@/ui/PopupMenu";
import { RefreshButton } from "@/ui/IconButton";
import { SearchField } from "@/ui/SearchField";
import { Segmented } from "@/ui/Segmented";
import { useContextMenu } from "@/ui/useContextMenu";

type MenuKind = "state" | "mine" | "labels" | "assignee" | "milestone" | "sort";

/** 検索の文を決めるまでの間（打っている間は聞かない） */
const TEXT_DELAY_MS = 500;

/** 絞り込みの札（押すと下にメニュー。既定から変えていれば色を付ける） */
function FilterChip({ label, active, onOpen }: { label: string; active: boolean; onOpen: (e: MouseEvent<HTMLButtonElement>) => void }) {
  return (
    <button type="button" className={cx("github-filter-chip", active && "active")} onClick={onOpen}>
      <span>{label}</span>
      <ChevronDown size={12} aria-hidden />
    </button>
  );
}

/**
 * GitHub タブの一覧の上（issue｜PR の切り替え・件数・取り直し、検索の欄、状態・自分・ラベル・担当・マイルストーン・並べ方の札）。
 * 絞り込みの候補（ラベルなど）は meta（なければ札のメニューに「読み込み中…」）
 */
export function GitHubFilterBar({
  filter,
  meta,
  total,
  loading,
  onChange,
  onKind,
  onRefresh,
}: {
  filter: GitHubListFilter;
  meta: GitHubRepoMeta | undefined;
  total: number | null;
  loading: boolean;
  onChange: (patch: Partial<GitHubListFilter>) => void;
  onKind: (kind: GitHubKind) => void;
  onRefresh: () => void;
}) {
  const menu = useContextMenu<MenuKind>();
  const [text, setText] = useState(filter.text);
  // 種類を切り替えた・外から変えたときは欄もそろえる
  useEffect(() => setText(filter.text), [filter.text, filter.kind]);
  useEffect(() => {
    if (text === filter.text) return;
    const timer = setTimeout(() => onChange({ text }), TEXT_DELAY_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  const open = (kind: MenuKind) => (e: MouseEvent<HTMLButtonElement>) => menu.toggle(e, kind);
  const mines = mineFiltersFor(filter.kind);
  const states = GITHUB_STATE_FILTERS.filter((s) => filter.kind === "pr" || s !== "merged");
  const pick = (patch: Partial<GitHubListFilter>) => () => onChange(patch);
  const loadingItem = !meta && (
    <MenuItem disabled onSelect={() => undefined}>
      読み込み中…
    </MenuItem>
  );

  return (
    <div className="github-filter-bar">
      <div className="github-filter-row">
        <Segmented
          className="segmented github-kind-switch"
          label="issue と PR の切り替え"
          value={filter.kind}
          onChange={onKind}
          options={GITHUB_KINDS.map((k) => ({ value: k, label: GITHUB_KIND_LABELS[k] }))}
        />
        <span className="github-filter-count muted small">{total === null ? "" : `${total.toLocaleString()} 件`}</span>
        <RefreshButton label="GitHub から取り直す" busy={loading} onClick={onRefresh} />
      </div>
      <SearchField
        className="github-search"
        value={text}
        onChange={setText}
        placeholder="検索（is:draft・author:… も使える）"
        label={`${GITHUB_KIND_LABELS[filter.kind]}を検索`}
        onKeyDown={(e) => e.key === "Enter" && !isComposing(e) && onChange({ text })}
      />
      <div className="github-filter-chips">
        <FilterChip label={GITHUB_STATE_FILTER_LABELS[filter.state]} active={filter.state !== "open"} onOpen={open("state")} />
        <FilterChip label={filter.mine ? GITHUB_MINE_FILTER_LABELS[filter.mine] : "自分"} active={filter.mine !== null} onOpen={open("mine")} />
        <FilterChip label={filter.labels.length ? `ラベル ${filter.labels.length}` : "ラベル"} active={filter.labels.length > 0} onOpen={open("labels")} />
        <FilterChip label={filter.assignee ? `担当: ${filter.assignee}` : "担当"} active={filter.assignee !== null} onOpen={open("assignee")} />
        <FilterChip label={filter.milestone ?? "マイルストーン"} active={filter.milestone !== null} onOpen={open("milestone")} />
        <FilterChip label={GITHUB_SORT_LABELS[filter.sort]} active={filter.sort !== "updated"} onOpen={open("sort")} />
        {activeFilterCount(filter) > 0 && (
          <button type="button" className="github-filter-clear" onClick={() => onChange({ ...defaultGitHubFilter(filter.kind), sort: filter.sort })}>
            <X size={12} aria-hidden />
            絞り込みを外す
          </button>
        )}
      </div>

      {menu.menu && (
        <PopupMenu at={menu.menu.at} label="絞り込み" ignore=".github-filter-chip" onClose={menu.close}>
          {menu.menu.value === "state" &&
            states.map((s) => (
              <MenuItem key={s} role="menuitemradio" checked={filter.state === s} onSelect={pick({ state: s })}>
                <span className="project-switch-item">{GITHUB_STATE_FILTER_LABELS[s]}</span>
                {filter.state === s && <Check size={14} aria-hidden />}
              </MenuItem>
            ))}
          {menu.menu.value === "mine" &&
            [null, ...mines].map((m: GitHubMineFilter | null) => (
              <MenuItem key={m ?? "none"} role="menuitemradio" checked={filter.mine === m} onSelect={pick({ mine: m })}>
                <span className="project-switch-item">{m ? GITHUB_MINE_FILTER_LABELS[m] : "絞り込まない"}</span>
                {filter.mine === m && <Check size={14} aria-hidden />}
              </MenuItem>
            ))}
          {menu.menu.value === "labels" &&
            (loadingItem ||
              (meta && meta.labels.length === 0 ? (
                <MenuItem disabled onSelect={() => undefined}>
                  ラベルがありません
                </MenuItem>
              ) : (
                meta?.labels.map((l) => {
                  const on = filter.labels.includes(l.name);
                  return (
                    <MenuItem
                      key={l.name}
                      role="menuitemcheckbox"
                      checked={on}
                      keepOpen
                      onSelect={() => onChange({ labels: on ? filter.labels.filter((x) => x !== l.name) : [...filter.labels, l.name] })}
                    >
                      <span className="github-label-dot" style={{ background: `#${l.color}` }} aria-hidden />
                      <span className="project-switch-item">{l.name}</span>
                      {on && <Check size={14} aria-hidden />}
                    </MenuItem>
                  );
                })
              )))}
          {menu.menu.value === "assignee" &&
            (loadingItem || (
              <>
                <MenuItem role="menuitemradio" checked={filter.assignee === null} onSelect={pick({ assignee: null })}>
                  <span className="project-switch-item">絞り込まない</span>
                </MenuItem>
                {meta?.assignees.map((u) => (
                  <MenuItem key={u.login} role="menuitemradio" checked={filter.assignee === u.login} onSelect={pick({ assignee: u.login })}>
                    <span className="project-switch-item">{u.login}</span>
                    {filter.assignee === u.login && <Check size={14} aria-hidden />}
                  </MenuItem>
                ))}
              </>
            ))}
          {menu.menu.value === "milestone" &&
            (loadingItem || (
              <>
                <MenuItem role="menuitemradio" checked={filter.milestone === null} onSelect={pick({ milestone: null })}>
                  <span className="project-switch-item">絞り込まない</span>
                </MenuItem>
                {meta?.milestones.length === 0 && (
                  <MenuItem disabled onSelect={() => undefined}>
                    開いているマイルストーンがありません
                  </MenuItem>
                )}
                {meta?.milestones.map((m) => (
                  <MenuItem key={m} role="menuitemradio" checked={filter.milestone === m} onSelect={pick({ milestone: m })}>
                    <span className="project-switch-item">{m}</span>
                    {filter.milestone === m && <Check size={14} aria-hidden />}
                  </MenuItem>
                ))}
              </>
            ))}
          {menu.menu.value === "sort" &&
            GITHUB_SORTS.map((s) => (
              <MenuItem key={s} role="menuitemradio" checked={filter.sort === s} onSelect={pick({ sort: s })}>
                <span className="project-switch-item">{GITHUB_SORT_LABELS[s]}</span>
                {filter.sort === s && <Check size={14} aria-hidden />}
              </MenuItem>
            ))}
        </PopupMenu>
      )}
    </div>
  );
}

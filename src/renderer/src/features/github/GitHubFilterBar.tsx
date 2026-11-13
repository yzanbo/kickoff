import { useEffect, useState, type MouseEvent } from "react";
import { Check, ChevronDown, Plus, X } from "lucide-react";
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
import { defaultGitHubFilter, githubSearchText, mineFiltersFor, parseGitHubSearchText } from "@shared/github/searchQuery";
import { cx } from "@/lib/cx";
import { activeFilterCount } from "@/lib/githubFilters";
import { isComposing } from "@/lib/keys";
import { MenuItem, PopupMenu } from "@/ui/PopupMenu";
import { IconButton, RefreshButton } from "@/ui/IconButton";
import { SearchField } from "@/ui/SearchField";
import { Segmented } from "@/ui/Segmented";
import { useContextMenu } from "@/ui/useContextMenu";

type MenuKind = "state" | "mine" | "labels" | "assignees" | "milestones" | "sort";

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

/** 複数選べる札の名前（なし → 名前・1 つ → その値・2 つ以上 → 名前と数） */
const chipLabel = (name: string, values: string[], one: (v: string) => string) => (values.length === 0 ? name : values.length === 1 ? one(values[0]) : `${name} ${values.length}`);

/** 複数選べるメニューの 1 行（押しても閉じない） */
function CheckItem({ label, on, onToggle }: { label: string; on: boolean; onToggle: () => void }) {
  return (
    <MenuItem role="menuitemcheckbox" checked={on} keepOpen onSelect={onToggle}>
      <span className="project-switch-item">{label}</span>
      {on && <Check size={14} aria-hidden />}
    </MenuItem>
  );
}

/**
 * GitHub タブの一覧の上（issue｜PR の切り替え・件数・取り直し・新しい issue、検索の欄、状態・自分・ラベル・担当・マイルストーン・並べ方の札。
 * ラベル・担当・マイルストーンはいくつも選べる。検索の欄は札も含めた検索の文で、書き換えると札も変わる）。
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
  onNewIssue,
}: {
  filter: GitHubListFilter;
  meta: GitHubRepoMeta | undefined;
  total: number | null;
  loading: boolean;
  onChange: (patch: Partial<GitHubListFilter>) => void;
  onKind: (kind: GitHubKind) => void;
  onRefresh: () => void;
  /** 新しい issue（ダイアログを開く） */
  onNewIssue: () => void;
}) {
  const menu = useContextMenu<MenuKind>();
  // 検索の欄は絞り込みすべてを文にしたもの（札を変えると文も変わり、文を書き換えると札も変わる）
  const committed = githubSearchText(filter);
  const [text, setText] = useState(committed);
  const sameAsFilter = (t: string) => githubSearchText(parseGitHubSearchText(filter.kind, t)) === committed;
  // 札・種類が変わったら欄もそろえる（同じ意味の書き方なら、打っている途中の文を崩さない）
  useEffect(() => {
    setText((cur) => (githubSearchText(parseGitHubSearchText(filter.kind, cur)) === committed ? cur : committed));
  }, [committed, filter.kind]);
  const commitText = (t: string) => {
    if (!sameAsFilter(t)) onChange(parseGitHubSearchText(filter.kind, t));
  };
  useEffect(() => {
    if (sameAsFilter(text)) return;
    const timer = setTimeout(() => commitText(text), TEXT_DELAY_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);
  /** 複数選べる札の 1 つを切り替える */
  const toggleIn = (key: "labels" | "assignees" | "milestones", value: string) => {
    const list = filter[key];
    onChange({ [key]: list.includes(value) ? list.filter((x) => x !== value) : [...list, value] });
  };

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
        <IconButton icon={Plus} label="新しい issue" onClick={onNewIssue} />
      </div>
      <SearchField
        className="github-search"
        value={text}
        onChange={setText}
        placeholder="検索（is:draft・author:… など GitHub の書き方も使える）"
        label={`${GITHUB_KIND_LABELS[filter.kind]}を検索`}
        onKeyDown={(e) => e.key === "Enter" && !isComposing(e) && commitText(text)}
      />
      <div className="github-filter-chips">
        <FilterChip label={GITHUB_STATE_FILTER_LABELS[filter.state]} active={filter.state !== "open"} onOpen={open("state")} />
        <FilterChip label={filter.mine ? GITHUB_MINE_FILTER_LABELS[filter.mine] : "自分"} active={filter.mine !== null} onOpen={open("mine")} />
        <FilterChip label={filter.labels.length ? `ラベル ${filter.labels.length}` : "ラベル"} active={filter.labels.length > 0} onOpen={open("labels")} />
        <FilterChip label={chipLabel("担当", filter.assignees, (v) => `担当: ${v}`)} active={filter.assignees.length > 0} onOpen={open("assignees")} />
        <FilterChip label={chipLabel("マイルストーン", filter.milestones, (v) => v)} active={filter.milestones.length > 0} onOpen={open("milestones")} />
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
                      onSelect={() => toggleIn("labels", l.name)}
                    >
                      <span className="github-label-dot" style={{ background: `#${l.color}` }} aria-hidden />
                      <span className="project-switch-item">{l.name}</span>
                      {on && <Check size={14} aria-hidden />}
                    </MenuItem>
                  );
                })
              )))}
          {menu.menu.value === "assignees" &&
            (loadingItem ||
              meta?.assignees.map((u) => (
                <CheckItem key={u.login} label={u.login} on={filter.assignees.includes(u.login)} onToggle={() => toggleIn("assignees", u.login)} />
              )))}
          {menu.menu.value === "milestones" &&
            (loadingItem ||
              (meta?.milestones.length === 0 ? (
                <MenuItem disabled onSelect={() => undefined}>
                  開いているマイルストーンがありません
                </MenuItem>
              ) : (
                meta?.milestones.map((m) => <CheckItem key={m} label={m} on={filter.milestones.includes(m)} onToggle={() => toggleIn("milestones", m)} />)
              )))}
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

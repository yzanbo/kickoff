import "./GitHubFilterBar.css";
import { useEffect, useEffectEvent, useState, type MouseEvent } from "react";
import { ChevronDown, Plus, X } from "lucide-react";
import { GITHUB_KIND_LABELS, GITHUB_KINDS, GITHUB_MINE_FILTER_LABELS, GITHUB_SORT_LABELS, GITHUB_SORTS, GITHUB_STATE_FILTER_LABELS, GITHUB_STATE_FILTERS, type GitHubKind, type GitHubListFilter, type GitHubMineFilter, type GitHubRepoMeta } from "@shared/github/types";
import { defaultGitHubFilter, githubSearchText, mineFiltersFor, parseGitHubSearchText } from "@shared/github/searchQuery";
import { cx } from "@/foundation/ui/lib/cx";
import { activeFilterCount } from "./githubFilters";
import { isComposing } from "@/foundation/ui/lib/keys";
import { CheckItem, RadioItem } from "@/foundation/ui/kit/menuParts";
import { MenuItem, PopupMenu } from "@/foundation/ui/kit/PopupMenu";
import { IconButton, RefreshButton } from "@/foundation/ui/kit/IconButton";
import { SearchField } from "@/foundation/ui/kit/SearchField";
import { Segmented } from "@/foundation/ui/kit/Segmented";
import { useContextMenu } from "@/foundation/ui/kit/useContextMenu";
import { FILTER_CHIPS, type FilterMenu } from "./githubFilterChips";

/** 検索の文を決めるまでの間（打っている間は聞かない） */
const TEXT_DELAY_MS = 500;

/** 絞り込みの札（押すと下にメニュー。既定から変えていれば色を付ける） */
function FilterChip({ label, active, onOpen }: { label: string; active: boolean; onOpen: (e: MouseEvent<HTMLButtonElement>) => void }) {
  return (
    <button type="button" className={cx("github-filter-chip pill", active && "active")} onClick={onOpen}>
      <span>{label}</span>
      <ChevronDown size={12} aria-hidden />
    </button>
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
  const menu = useContextMenu<FilterMenu>();
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
  // 打つのが止まったら当てる（待つのは文が変わったときだけ。札が変わっても待ち直さない）
  const isSameAsFilter = useEffectEvent((t: string) => sameAsFilter(t));
  const commitTyped = useEffectEvent((t: string) => commitText(t));
  useEffect(() => {
    if (isSameAsFilter(text)) return;
    const timer = setTimeout(() => commitTyped(text), TEXT_DELAY_MS);
    return () => clearTimeout(timer);
  }, [text]);
  /** 複数選べる札の 1 つを切り替える */
  const toggleIn = (key: "labels" | "assignees" | "milestones", value: string) => {
    const list = filter[key];
    onChange({ [key]: list.includes(value) ? list.filter((x) => x !== value) : [...list, value] });
  };

  const open = (kind: FilterMenu) => (e: MouseEvent<HTMLButtonElement>) => menu.toggle(e, kind);
  const mines = mineFiltersFor(filter.kind);
  const states = GITHUB_STATE_FILTERS.filter((s) => filter.kind === "pr" || s !== "merged");
  const pick = (patch: Partial<GitHubListFilter>) => () => onChange(patch);
  const loadingItem = !meta && (
    <MenuItem disabled onSelect={() => undefined}>
      読み込み中…
    </MenuItem>
  );

  return (
    <div className="github-filter-bar bar">
      <div className="github-filter-row">
        <Segmented
          className="github-kind-switch"
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
        {FILTER_CHIPS.map((c) => (
          <FilterChip key={c.menu} label={c.label(filter)} active={c.active(filter)} onOpen={open(c.menu)} />
        ))}
        {activeFilterCount(filter) > 0 && (
          <button type="button" className="github-filter-clear pill" onClick={() => onChange({ ...defaultGitHubFilter(filter.kind), sort: filter.sort })}>
            <X size={12} aria-hidden />
            絞り込みを外す
          </button>
        )}
      </div>

      {menu.menu && (
        <PopupMenu at={menu.menu.at} label="絞り込み" ignore=".github-filter-chip" onClose={menu.close}>
          {menu.menu.value === "state" &&
            states.map((s) => <RadioItem key={s} label={GITHUB_STATE_FILTER_LABELS[s]} checked={filter.state === s} onSelect={pick({ state: s })} />)}
          {menu.menu.value === "mine" &&
            [null, ...mines].map((m: GitHubMineFilter | null) => (
              <RadioItem key={m ?? "none"} label={m ? GITHUB_MINE_FILTER_LABELS[m] : "絞り込まない"} checked={filter.mine === m} onSelect={pick({ mine: m })} />
            ))}
          {menu.menu.value === "labels" &&
            (loadingItem ||
              (meta && meta.labels.length === 0 ? (
                <MenuItem disabled onSelect={() => undefined}>
                  ラベルがありません
                </MenuItem>
              ) : (
                meta?.labels.map((l) => (
                  <CheckItem
                    key={l.name}
                    lead={<span className="github-label-dot" style={{ background: `#${l.color}` }} aria-hidden />}
                    label={l.name}
                    checked={filter.labels.includes(l.name)}
                    onSelect={() => toggleIn("labels", l.name)}
                  />
                ))
              )))}
          {menu.menu.value === "assignees" &&
            (loadingItem ||
              meta?.assignees.map((u) => (
                <CheckItem key={u.login} label={u.login} checked={filter.assignees.includes(u.login)} onSelect={() => toggleIn("assignees", u.login)} />
              )))}
          {menu.menu.value === "milestones" &&
            (loadingItem ||
              (meta?.milestones.length === 0 ? (
                <MenuItem disabled onSelect={() => undefined}>
                  開いているマイルストーンがありません
                </MenuItem>
              ) : (
                meta?.milestones.map((m) => <CheckItem key={m} label={m} checked={filter.milestones.includes(m)} onSelect={() => toggleIn("milestones", m)} />)
              )))}
          {menu.menu.value === "sort" &&
            GITHUB_SORTS.map((s) => <RadioItem key={s} label={GITHUB_SORT_LABELS[s]} checked={filter.sort === s} onSelect={pick({ sort: s })} />)}
        </PopupMenu>
      )}
    </div>
  );
}

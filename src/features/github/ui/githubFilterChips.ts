// GitHub タブの絞り込みの札の表（名前と、既定から変えているか。純粋）
import { GITHUB_MINE_FILTER_LABELS, GITHUB_SORT_LABELS, GITHUB_STATE_FILTER_LABELS, type GitHubListFilter } from "@shared/github/types";

export type FilterMenu = "state" | "mine" | "labels" | "assignees" | "milestones" | "sort";

/** 複数選べる札の名前（なし → 名前・1 つ → その値・2 つ以上 → 名前と数） */
const chipLabel = (name: string, values: string[], one: (v: string) => string) => (values.length === 0 ? name : values.length === 1 ? one(values[0]) : `${name} ${values.length}`);

/** 札の並び（押すとそのメニュー。既定から変えていれば active で色を付ける） */
export const FILTER_CHIPS: readonly { menu: FilterMenu; label: (f: GitHubListFilter) => string; active: (f: GitHubListFilter) => boolean }[] = [
  { menu: "state", label: (f) => GITHUB_STATE_FILTER_LABELS[f.state], active: (f) => f.state !== "open" },
  { menu: "mine", label: (f) => (f.mine ? GITHUB_MINE_FILTER_LABELS[f.mine] : "自分"), active: (f) => f.mine !== null },
  { menu: "labels", label: (f) => (f.labels.length ? `ラベル ${f.labels.length}` : "ラベル"), active: (f) => f.labels.length > 0 },
  { menu: "assignees", label: (f) => chipLabel("担当", f.assignees, (v) => `担当: ${v}`), active: (f) => f.assignees.length > 0 },
  { menu: "milestones", label: (f) => chipLabel("マイルストーン", f.milestones, (v) => v), active: (f) => f.milestones.length > 0 },
  { menu: "sort", label: (f) => GITHUB_SORT_LABELS[f.sort], active: (f) => f.sort !== "updated" },
];

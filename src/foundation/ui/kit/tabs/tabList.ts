/**
 * タブの列の純粋な操作（開く・閉じる・固定・仮のタブ・並べ替え）。パネルの配置（分割・欄）は panel が持つ。
 * どれも新しい状態を返し、変わらなければ同じ状態を返す
 */
export interface TabItem {
  key: string;
  /** 固定したタブ */
  pinned?: boolean;
  /** 仮のタブ（1 回押して開いた。次の仮のタブが同じ場所を置き換える。ダブルクリック・書き換えで固定） */
  preview?: boolean;
}

export interface TabListState<T extends TabItem> {
  tabs: readonly T[];
  /** 表示中のタブ（なければ null） */
  active: string | null;
}

/** 仮のタブの印を外す（仮でなければそのまま） */
function kept<T extends TabItem>(tab: T): T {
  if (!tab.preview) return tab;
  const { preview: _drop, ...rest } = tab;
  return rest as T;
}

/** key のタブを fn で置き換える（同じ物が返ったら状態もそのまま） */
function mapTab<T extends TabItem>(s: TabListState<T>, key: string, fn: (tab: T) => T): TabListState<T> {
  const at = s.tabs.findIndex((t) => t.key === key);
  if (at < 0) return s;
  const next = fn(s.tabs[at]);
  if (next === s.tabs[at]) return s;
  return { ...s, tabs: s.tabs.with(at, next) };
}

/**
 * タブを開いて表示する。同じキーがあれば選ぶだけ（仮でなく開いたら固定する）。
 * preview なら、いまの仮のタブを同じ場所で置き換える（なければ足す）。新しいタブは after（省けば表示中のタブ）の右に足す
 */
export function openTab<T extends TabItem>(s: TabListState<T>, tab: T, o: { preview?: boolean; after?: string | null } = {}): TabListState<T> {
  if (s.tabs.some((t) => t.key === tab.key)) {
    const opened = s.active === tab.key ? s : { ...s, active: tab.key };
    return o.preview ? opened : keepTab(opened, tab.key);
  }
  const next = o.preview ? { ...tab, preview: true } : kept(tab);
  const current = o.preview ? s.tabs.findIndex((t) => t.preview) : -1;
  if (current >= 0) return { tabs: s.tabs.with(current, next), active: next.key };
  const after = o.after === undefined ? s.active : o.after;
  const at = after === null ? -1 : s.tabs.findIndex((t) => t.key === after);
  const tabs = [...s.tabs];
  tabs.splice(at < 0 ? tabs.length : at + 1, 0, next);
  return { tabs, active: next.key };
}

/** タブを閉じる（表示中なら右隣、なければ左隣を表示） */
export function closeTab<T extends TabItem>(s: TabListState<T>, key: string): TabListState<T> {
  const at = s.tabs.findIndex((t) => t.key === key);
  if (at < 0) return s;
  const tabs = s.tabs.filter((t) => t.key !== key);
  const active = s.active === key ? (tabs[at]?.key ?? tabs[at - 1]?.key ?? null) : s.active;
  return { tabs, active };
}

/** 固定する・外す（固定したら仮でもなくなる） */
export function pinTab<T extends TabItem>(s: TabListState<T>, key: string, pinned: boolean): TabListState<T> {
  return mapTab(s, key, (tab) => {
    if (Boolean(tab.pinned) === pinned && (!pinned || !tab.preview)) return tab;
    const { pinned: _drop, ...rest } = kept(tab);
    return (pinned ? { ...rest, pinned: true } : rest) as T;
  });
}

/** 仮のタブを残す（ダブルクリック・書き換えたとき。仮でなければそのまま） */
export function keepTab<T extends TabItem>(s: TabListState<T>, key: string): TabListState<T> {
  return mapTab(s, key, kept);
}

/** key のタブを target の前（before）か後ろ（after）へ動かす */
export function moveTab<T extends TabItem>(s: TabListState<T>, key: string, target: string, side: "before" | "after"): TabListState<T> {
  const tab = s.tabs.find((t) => t.key === key);
  if (!tab || key === target) return s;
  const rest = s.tabs.filter((t) => t.key !== key);
  const at = rest.findIndex((t) => t.key === target);
  if (at < 0) return s;
  const tabs = [...rest];
  tabs.splice(side === "before" ? at : at + 1, 0, tab);
  return tabs.every((t, i) => t === s.tabs[i]) ? s : { ...s, tabs };
}

// サイドバーのビューの項目の表（見え方の 11 項目）。型・読む・比べる・当てる・⚙ の窓のボタン・設定の画面の欄・一覧の説明は、この表を回して作る。
// 項目を足すときは、保存の宣言（持ち主の storage.ts）と VIEW_SETTINGS・VIEW_FIELDS の 1 行と、初めのビュー（initialViews.ts）を足す
import {
  Archive,
  ArchiveX,
  ArrowUpToLine,
  Clock,
  FolderTree,
  FolderUp,
  GalleryHorizontal,
  GalleryVertical,
  GripVertical,
  ListFilter,
  ListTree,
  Rows2,
  Rows3,
  Rows4,
  ToggleLeft,
  ToggleRight,
  type LucideIcon,
} from "lucide-react";
import { useSyncExternalStore } from "react";
import type { NamedView } from "@/foundation/ui/lib/namedViews";
import { readSetting, subscribeSetting, writeSetting, type Setting, type SettingValue } from "@/foundation/ui/storage";
import { CHAT_GROUPINGS, CHAT_ORDERS, chatListSettings, GROUPING_META, ORDER_META } from "@/features/chatList/ui";
import { projectsSettings } from "@/features/projects/ui";
import { storage } from "./storage";

/** 項目の設定（ビューはこの組を覚えるだけで、当てるときにそれぞれの設定へ書く） */
const VIEW_SETTINGS = {
  layout: storage.settings.layout,
  projectOrder: projectsSettings.listOrder,
  projectCompact: chatListSettings.projectCompact,
  showArchivedProjects: storage.settings.showArchivedProjects,
  grouping: chatListSettings.sections,
  chatOrder: chatListSettings.order,
  chatCompact: chatListSettings.compact,
  showArchivedChats: chatListSettings.showArchived,
  waitingOn: storage.settings.waitingOnly,
  waitingScope: storage.settings.waitingScope,
  waitingOrder: storage.settings.waitingOrder,
} as const;

/** ビューに入れる見え方（⚙ の窓の 3 行のボタンの値。それぞれの設定と 1 対 1） */
export type SidebarViewState = { -readonly [K in keyof typeof VIEW_SETTINGS]: SettingValue<(typeof VIEW_SETTINGS)[K]> };
export type ViewKey = keyof SidebarViewState;
export type SidebarView = NamedView<SidebarViewState>;

type Value = string | boolean;
/** 選択肢 1 つ（short = ボタン・欄に出すいまの値 / label = メニューの項目と説明） */
interface ChoiceMeta {
  short: string;
  label?: string;
  icon: LucideIcon;
}
/** ⚙ の窓の説明に渡すもの */
export interface TunerContext {
  state: SidebarViewState;
  /** しまったプロジェクトの数 */
  archivedCount: number;
}
export type ViewRow = "project" | "chat" | "waiting";

interface ViewField<V extends Value> {
  row: ViewRow;
  /** 設定の画面の欄の名前 */
  label: string;
  /** ⚙ の窓のボタン（id は見た目のクラス head-menu-… / head-toggle-…。menu があれば選択肢のメニュー、なければ押すたびに切り替え） */
  head: { id: string; label: string; title(value: V, ctx: TunerContext): string; menu?: string; pressed?: true };
  /** 選択肢（画面に並べる順） */
  choices: readonly V[];
  meta: Record<`${V}`, ChoiceMeta>;
  /** 選べる・比べるのは、この形のときだけ */
  enabledWhen?(state: SidebarViewState): boolean;
  /** 一覧の説明に出す文（null は出さない。省けば選択肢の short） */
  brief?(value: V, state: SidebarViewState): string | null;
  /** 選んだときに一緒に変えるもの */
  with?(value: V): Partial<SidebarViewState>;
}

export const ROW_LABELS: Record<ViewRow, string> = { project: "プロジェクト", chat: "チャット", waiting: "要対応" };

/** プロジェクトの並べ方（stack = すべてを縦に並べる / slide = 1 つずつ横にスライド（丸は下）/ rail = 1 つずつ縦にスライド（丸は左）） */
const LAYOUT_META = {
  stack: { icon: Rows3, short: "縦並び", label: "縦並び（すべてのプロジェクトを上から並べる）" },
  slide: { icon: GalleryHorizontal, short: "スライド", label: "横スライド（1 つずつ。丸は下・横スワイプ）" },
  rail: { icon: GalleryVertical, short: "縦スライド", label: "縦スライド（1 つずつ。丸は左・縦スワイプ）" },
};
/** 要対応の出し方（only = 要対応のチャットだけ / top = 一覧全体の上にまとめ、その下はすべて / project = 各プロジェクトの中のいちばん上にまとめ、その下はすべて） */
const WAITING_SCOPE_META = {
  only: { icon: ListFilter, short: "要対応だけ", label: "要対応だけ（待っているチャットだけを並べる）" },
  top: { icon: ArrowUpToLine, short: "一覧の上に", label: "一覧の上にまとめる（待っているチャットを一覧全体のいちばん上に。その下はすべて）" },
  project: { icon: FolderUp, short: "プロジェクト内", label: "プロジェクト内の上にまとめる（待っているチャットを各プロジェクトの中のいちばん上に。その下はすべて）" },
};
/** 要対応の並べ方。「〜別」は見出しに分ける、「〜順」は並べる順（チャットの並び順と同じ言い方。状態順のアイコンも同じ） */
const WAITING_ORDER_META = {
  project: { icon: FolderTree, short: "プロジェクト別", label: "プロジェクト別（プロジェクトの見出しに分ける）" },
  status: { icon: ListTree, short: "状態順", label: "状態順（プロジェクトをまたいで、回答待ち → エラー → 未読の見出しに分ける）" },
};
const ROWS_META = { true: { short: "1 行", icon: Rows4 }, false: { short: "2 行", icon: Rows2 } };
const ARCHIVE_META = { true: { short: "表示", icon: Archive }, false: { short: "隠す", icon: ArchiveX } };
const BOTH = [true, false] as const;
const archivedBrief = (shown: boolean) => (shown ? "アーカイブを表示" : null);
const whenWaiting = (short: string, state: SidebarViewState) => (state.waitingOn ? short : null);
const OFF_NOTE = "要対応がオフのときは選べません（左の切り替えでオンにする）";

export const VIEW_FIELDS: { [K in ViewKey]: ViewField<SidebarViewState[K]> } = {
  layout: {
    row: "project",
    label: "プロジェクトの並べ方",
    head: { id: "layout", label: "並べ方", menu: "プロジェクトの並べ方", title: (v) => `プロジェクトの並べ方（いまは「${LAYOUT_META[v].label}」）` },
    choices: ["stack", "slide", "rail"],
    meta: LAYOUT_META,
  },
  projectOrder: {
    row: "project",
    label: "プロジェクトの並び順",
    head: {
      id: "order",
      label: "並び順",
      title: () => "プロジェクトの並び順（手動 = ドラッグで並べ替えた順 / 最近動いた順。最近動いた順でもドラッグすると手動になる。固定したものは上）",
    },
    choices: ["manual", "recent"],
    meta: { manual: { short: "手動", icon: GripVertical }, recent: { short: "最近順", icon: Clock } },
  },
  projectCompact: {
    row: "project",
    label: "プロジェクトのカード",
    head: { id: "project-rows", label: "表示", title: () => "プロジェクトのカード（1 行 = 名前だけ / 2 行 = チャット数も）" },
    choices: BOTH,
    meta: ROWS_META,
  },
  showArchivedProjects: {
    row: "project",
    label: "しまったプロジェクト",
    head: { id: "archive-projects", label: "アーカイブ", title: (_, c) => `アーカイブしたプロジェクト（${c.archivedCount} 件）` },
    choices: BOTH,
    meta: ARCHIVE_META,
    brief: archivedBrief,
  },
  grouping: {
    row: "chat",
    label: "チャットのまとめ方",
    head: { id: "grouping", label: "まとめ方", menu: "チャットのまとめ方", title: (v) => `チャットのまとめ方（すべてのプロジェクト。いまは「${GROUPING_META[v].label}」）` },
    choices: CHAT_GROUPINGS,
    meta: GROUPING_META,
  },
  chatOrder: {
    row: "chat",
    label: "チャットの並び順",
    head: {
      id: "chat-order",
      label: "並び順",
      menu: "チャットの並び順",
      title: (v) =>
        `チャットの並び順（まとめ方の見出しの中で並べる。状態順 = 作業中・回答待ち・未読・既読の見出しに分ける / 手動 = ドラッグで並べた順。いまは「${ORDER_META[v].label}」）`,
    },
    choices: CHAT_ORDERS,
    meta: ORDER_META,
  },
  chatCompact: {
    row: "chat",
    label: "チャットの行",
    head: { id: "rows", label: "表示", title: () => "チャットの行（1 行 = 名前と時刻 / 2 行 = ブランチも）" },
    choices: BOTH,
    meta: ROWS_META,
  },
  showArchivedChats: {
    row: "chat",
    label: "アーカイブ済みのチャット",
    head: { id: "archive-chats", label: "アーカイブ", title: () => "アーカイブしたチャット" },
    choices: BOTH,
    meta: ARCHIVE_META,
    brief: archivedBrief,
  },
  waitingOn: {
    row: "waiting",
    label: "要対応",
    head: { id: "waiting-on", label: "切り替え", title: () => "要対応（回答待ち・エラー・未読のチャットに目を向ける）", pressed: true },
    choices: BOTH,
    meta: { true: { short: "オン", icon: ToggleRight }, false: { short: "オフ", icon: ToggleLeft } },
    brief: (on) => (on ? null : "オフ"),
  },
  waitingScope: {
    row: "waiting",
    label: "要対応の出し方",
    head: { id: "waiting-scope", label: "出し方", menu: "要対応の出し方", title: (v, c) => (c.state.waitingOn ? `要対応の出し方（いまは「${WAITING_SCOPE_META[v].label}」）` : OFF_NOTE) },
    choices: ["only", "top", "project"],
    meta: WAITING_SCOPE_META,
    enabledWhen: (s) => s.waitingOn,
    brief: (v, s) => whenWaiting(WAITING_SCOPE_META[v].short, s),
    // プロジェクト内の上には、プロジェクトの中に置くので並べ方はプロジェクト別だけ
    with: (v) => (v === "project" ? { waitingOrder: "project" } : {}),
  },
  waitingOrder: {
    row: "waiting",
    label: "要対応の並べ方",
    head: {
      id: "waiting-order",
      label: "並べ方",
      title: (_, c) =>
        !c.state.waitingOn
          ? OFF_NOTE
          : c.state.waitingScope !== "project"
            ? `要対応の並べ方（${WAITING_ORDER_META.project.label} / ${WAITING_ORDER_META.status.label}）`
            : "要対応の並べ方: プロジェクト内の上にまとめるときは、プロジェクトの中に置くのでプロジェクト別だけです（中は状態順）",
    },
    choices: ["project", "status"],
    meta: WAITING_ORDER_META,
    enabledWhen: (s) => s.waitingOn && s.waitingScope !== "project",
    brief: (v, s) => whenWaiting(WAITING_ORDER_META[v].short, s),
  },
};

export const VIEW_KEYS = Object.keys(VIEW_FIELDS) as ViewKey[];

/** ビューを消しても残るもの（削除の確かめの説明。見出しのタブと設定の画面で同じ） */
export const SIDEBAR_REMOVE_NOTE = "サイドバーの見え方はいまのまま残ります。";

/** 項目 1 つ（表を回すときに値の型をそろえて読む） */
export const viewField = (key: ViewKey) => VIEW_FIELDS[key] as unknown as ViewField<Value>;
const settingOf = (key: ViewKey) => VIEW_SETTINGS[key] as Setting<Value>;
export const keysOfRow = (row: ViewRow) => VIEW_KEYS.filter((k) => VIEW_FIELDS[k].row === row);
export const choiceMeta = (key: ViewKey, value: Value) => (viewField(key).meta as Record<string, ChoiceMeta>)[String(value)];
export const fieldEnabled = (key: ViewKey, state: SidebarViewState) => viewField(key).enabledWhen?.(state) ?? true;
/** key を value にするときに書く組（一緒に変えるものも） */
export const patchOf = (key: ViewKey, value: Value): Partial<SidebarViewState> => ({ [key]: value, ...viewField(key).with?.(value) });

const isValue = (key: ViewKey, value: unknown) => viewField(key).choices.includes(value as Value);

/** 保存した見え方を読む（合わない項目があれば undefined。そのビューは捨てる） */
export function parseSidebarViewState(value: unknown): SidebarViewState | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const v = value as Record<string, unknown>;
  if (!VIEW_KEYS.every((k) => isValue(k, v[k]))) return undefined;
  return Object.fromEntries(VIEW_KEYS.map((k) => [k, v[k]])) as SidebarViewState;
}

/** 保存したビューの一覧を読む（見え方の合わないものは捨てる） */
export function parseSidebarViews(list: readonly { id: string; name: string; state: unknown }[]): SidebarView[] {
  return list.flatMap((v) => {
    const state = parseSidebarViewState(v.state);
    return state ? [{ id: v.id, name: v.name, state }] : [];
  });
}

/** 同じ見え方か。選べない項目は比べない（要対応がオフどうしなら、出し方 × 並べ方は見え方が変わらないので） */
export const sameSidebarViewState = (a: SidebarViewState, b: SidebarViewState) => VIEW_KEYS.every((k) => !fieldEnabled(k, a) || a[k] === b[k]);

/** いまの見え方に合う、いちばん前のビュー */
export const activeSidebarView = (views: readonly SidebarView[], current: SidebarViewState) => views.find((v) => sameSidebarViewState(v.state, current));

/** 名前の決まっていない新しいビューの名前（「ビュー 1」から、同じ名前のない番号） */
export function newSidebarViewName(views: readonly SidebarView[]): string {
  const names = new Set(views.map((v) => v.name));
  for (let n = 1; ; n++) if (!names.has(`ビュー ${n}`)) return `ビュー ${n}`;
}

/** ビューの見え方の短い説明（設定の画面の一覧の行。行ごとに「プロジェクト: 縦並び・最近順・2 行」） */
export function describeSidebarView(s: SidebarViewState): string {
  const brief = (k: ViewKey) => {
    const f = viewField(k);
    return f.brief ? f.brief(s[k], s) : choiceMeta(k, s[k]).short;
  };
  return (Object.keys(ROW_LABELS) as ViewRow[])
    .map((row) => `${ROW_LABELS[row]}: ${keysOfRow(row).map(brief).filter(Boolean).join("・")}`)
    .join(" / ");
}

/** いまの見え方を読む */
export const readSidebarView = () => Object.fromEntries(VIEW_KEYS.map((k) => [k, readSetting(settingOf(k))])) as SidebarViewState;

/** 見え方を当てる（渡した項目をそれぞれの設定に書く） */
export function applySidebarView(state: Partial<SidebarViewState>): void {
  for (const k of VIEW_KEYS) if (k in state) writeSetting(settingOf(k), state[k] as Value);
}

let lastView: SidebarViewState | undefined;
const snapshotView = () => {
  const next = readSidebarView();
  if (lastView && VIEW_KEYS.every((k) => lastView?.[k] === next[k])) return lastView;
  return (lastView = next);
};
const subscribeView = (listener: () => void) => {
  const offs = VIEW_KEYS.map((k) => subscribeSetting(settingOf(k), listener));
  return () => offs.forEach((off) => off());
};

/** いまの見え方（どれかの設定が変わったら描き直す） */
export const useSidebarViewState = () => useSyncExternalStore(subscribeView, snapshotView);

// タブの種類の口: 種類ごとの違い（アイコン・名前・中身・後始末・別ウィンドウ）を 1 つの項目にまとめ、拡張点 panelTabs で受ける。
// 種類を名指しして分岐させず、店・タブの列・中身の枠は kindOf(tab) の項目から引く
import type { ComponentType } from "react";
import type { LucideIcon } from "lucide-react";
import { definePoint } from "@/foundation/ui/points";
import type { PopoutRoute } from "@/foundation/ui/navigation/popout";
import type { PanelPageOps } from "./usePanel";

/** タブの中身の基底（中身の型は種類ごとに足す） */
export interface TabBase {
  key: string;
  kind: string;
}

/** タブの名前の後ろに添えるグループ（名前と色。色は分からないとき null） */
export interface TabGroupBadge {
  name: string;
  hue: number | null;
}

/** プロジェクトのグループを引く（なければ undefined） */
export type TabGroupLookup = (projectId: number, groupId: number | null | undefined) => TabGroupBadge | undefined;

/** タブの名前に使うチャットの値（サイドバーの一覧にあれば最新のもの） */
export interface TabChat {
  title: string;
  group_id: number | null;
}

/** タブの中身に渡すもの */
export interface TabPageProps<T extends TabBase> {
  tab: T;
  /** 欄の操作（欄の状態が変わっても同じ物） */
  panel: PanelPageOps;
  /** 欄を開いていて、自分のペインで表示中か */
  visible: boolean;
  /** 自分のペインにピントがあるか（ターミナルの入力先） */
  focused: boolean;
}

export interface TabKind<T extends TabBase> {
  id: T["kind"];
  /** その種類のタブか（defineTabKind が id から作る） */
  is(tab: TabBase): tab is T;
  /** タブのアイコン（チャットのタブは、状態の印に置き換わる） */
  icon: LucideIcon;
  iconClass?: string;
  /**
   * 名前の前に置く種類の札（チャットの画面の右の欄に並ぶノート・サブエージェント・子チャットを、タブを見ただけで見分ける）。札があるタブは、
   * 上の 1px の線と表示中の枠も同じ形で、色だけ種類ごとに変える（CSS の panel/side-panel-tab-kinds.css）
   */
  badge?: string;
  /** 札の文をタブごとに変えるときの部品（子チャットの深さ「子 / 孫 / ひ孫」。なければ badge の文） */
  BadgeText?: ComponentType<{ tab: T }>;
  /** アイコンの代わりに名前の前に置く部品（サブエージェントのタブの状態のアイコン。チャットのタブの状態の印は PaneTab が出す） */
  Lead?: ComponentType<{ tab: T }>;
  /** タブに出す名前（chat はタブのチャット（サイドバーの一覧にあれば最新のもの）） */
  label(tab: T, chat: TabChat | undefined): string;
  /** マウスを乗せたときの説明（なければ名前とグループ名） */
  hint?(tab: T): string;
  /** 名前の後ろに控えめに添えるグループ名（groupOf はプロジェクトのグループ名を引く） */
  group?(tab: T, chat: TabChat | undefined, groupOf: TabGroupLookup): TabGroupBadge | undefined;
  /** どのプロジェクトのタブか（まとまり・グループ名を引くのに使う。ブラウザはどれにも入らない） */
  projectOf(tab: T): number | undefined;
  /** どのチャットのタブか（そのチャットを消したら閉じる。チャット・サブエージェントなど） */
  ownerChatId?(tab: T): number | null;
  /** 中身を作る時（shown = 初めて表示したとき。チャットのタブはサイドバーと連動して自動で増えるので、見ていないチャットまで読み込まない。既定は mounted） */
  createWhen?: "shown" | "mounted";
  /** 閉じたときの後始末（ターミナルはシェルも止める。別ウィンドウへ移すとき（keep）は呼ばない） */
  dispose?(tab: T): void;
  /**
   * 別ウィンドウで開けるタブの行き先とウィンドウの名前（チャットの画面の右の欄のサブエージェント・変更・ファイル・ノート・子チャット、パネルのブラウザ・ターミナル）。
   * panel はタブのある欄（戻す先）
   */
  popout?(tab: T, panel: string): { route: PopoutRoute; title: string };
  /** タブの中身（表示していないタブも hidden で残す） */
  Page: ComponentType<TabPageProps<T>>;
}

/** 種類を 1 つ作る（is を足すだけ。登録はしない） */
export function defineTabKind<T extends TabBase>(spec: Omit<TabKind<T>, "is">): TabKind<T> {
  return { ...spec, is: (tab): tab is T => tab.kind === spec.id };
}

/** どの種類も入る形（種類ごとに中身の型が違う項目を 1 つの点に並べる。中身の型は項目の中で閉じている） */
export type AnyTabKind = TabKind<any>;

/** タブの種類の拡張点（app/renderer/registry.ts が入れ、店を作るときに渡す） */
export const panelTabs = definePoint<AnyTabKind>("panelTabs", { key: (k) => k.id });

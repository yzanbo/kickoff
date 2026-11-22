// タブの種類の口: 種類ごとの違い（アイコン・名前・中身・後始末・別ウィンドウ）を 1 つの項目にまとめ、拡張点 panelTabs で受ける。
// 種類を名指しして分岐させず、店・タブの列・中身の枠は kindOf(tab) の項目から引く
import type { ComponentType, HTMLAttributes, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { definePoint } from "@/foundation/ui/points";
import type { PopoutRoute } from "@/foundation/ui/navigation/popout";
import type { PanelController, PanelPageOps } from "./usePanel";
import type { TabPatch } from "./state/panelState";

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

/** タブの列のタブ 1 つの、種類が足し替える見た目（どれもなければ種類によらない形のまま） */
export interface TabFace {
  /** 名前（店を読む名前。子チャットのいまの名前） */
  label?: string;
  /** マウスを乗せたときの説明（hint がない種類だけ。なければ名前とグループ名） */
  title?: string;
  /** 名前の後ろに添えるグループ（店を読むもの。送る前の新しいチャットの作成先） */
  group?: TabGroupBadge;
  /** アイコンの代わりに名前の前に置くもの（状態の印） */
  lead?: ReactNode;
  /** 名前のすぐ後ろ（子チャットの動きの印・添付ありの印） */
  after?: ReactNode;
  /** グループの札の後ろ（作業場所の札）と、その中身が変わったら測り直すためのキー */
  tag?: ReactNode;
  tagKey?: string;
  /** ピン留めしたチャットのプロジェクト（いちばん左にピン） */
  pinnedIn?: number | null;
  /** 名前を太字にする（未読・失敗） */
  unread?: boolean;
  /** タブに足す属性（先読み・ページ内検索が読む印） */
  attrs?: HTMLAttributes<HTMLDivElement>;
  /** 保存していない変更がある（× の代わりに ●）と、そのときの閉じるボタンの名前 */
  dirty?: boolean;
  closeLabel?: string;
}

/** 種類のタブの見た目の部品に渡すもの（部品は店を読んで render に足し替える見た目を渡す） */
export interface TabFaceProps<T extends TabBase> {
  tab: T;
  panel: PanelController;
  /** タブに出す項目を選んでいるか（項目の名前は欄の持ち主が決める。「表示」のメニューの「タブに出す項目」） */
  show(field: string): boolean;
  /** 種類によらない形で決めた名前とグループ */
  base: { label: string; group: TabGroupBadge | undefined };
  /** プロジェクトのグループ（名前と色）を引く（店を読んで決めるグループに使う） */
  groupOf: TabGroupLookup;
  render(face: TabFace): ReactNode;
}

/** 作業場所（プロジェクトとワークツリーのフォルダ。本体なら null） */
export interface WorkplaceAt {
  projectId: number;
  worktree: string | null;
}

/** チャットの作業場所を移したこと（TabKind.repoint） */
export interface WorkplaceMove {
  chatId: number;
  from: WorkplaceAt;
  to: WorkplaceAt;
}

/**
 * 作業場所を指すタブ（チャットの画面の右の欄の、チャット・プロジェクト・ワークツリーを持つタブ）が、移す前の作業場所のものなら、
 * 新しい作業場所の値（tabData の作る関数に渡す形）を返す。違えば null
 */
export function repointedAt(tab: { chatId: number; projectId: number; worktree?: string }, move: WorkplaceMove): { chatId: number; projectId: number; worktree?: string } | null {
  if (tab.chatId !== move.chatId || tab.projectId !== move.from.projectId || (tab.worktree ?? null) !== move.from.worktree) return null;
  return { chatId: move.chatId, projectId: move.to.projectId, ...(move.to.worktree ? { worktree: move.to.worktree } : {}) };
}

/** タブの右クリックのメニューに、土台が作った項目を渡して種類の項目と並べさせる */
export interface TabMenuProps<T extends TabBase> {
  tab: T;
  panel: PanelController;
  /** 右クリックしたタブのペイン */
  paneId: string;
  /** 表示する場所の組（分ける・移す・別ウィンドウ・一覧のペインに戻す） */
  before: ReactNode;
  /** タブの組（タブの表示 ›・タブを閉じる） */
  after: ReactNode;
  onRename(): void;
  onClose(): void;
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
  /** アイコンの代わりに名前の前に置く部品（ファイルの種類のアイコン・ブラウザの AI 操作中の印。状態の印は Face が出す） */
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
  /** 自分で開き直したとき（もう開いていた）に変える中身（reopenOf → openTab の reopen。なければ開いていたタブをそのまま表示する） */
  reopen?(tab: T): TabPatch | undefined;
  /** 閉じたときの後始末（ターミナルはシェルも止める。別ウィンドウへ移すとき（keep）は呼ばない） */
  dispose?(tab: T): void;
  /** 閉じてよいか（保存していない書きかけを聞く）。×・右クリックの「タブを閉じる」・ペインを閉じる、のどれでも聞く */
  confirmClose?(tab: T, panel: string): Promise<boolean>;
  /** × の動きの差し替え（チャットは閉じ方を聞く）。分けたペインの連動したチャットを一覧のペインへ戻すのは、これより先に土台がする */
  close?(tab: T, ctx: { panel: PanelController; close(opts?: { dismiss?: boolean }): void }): void;
  /** その場で名前を変えられる種類（ダブルクリック・Enter・右クリックの「名前を変更」） */
  rename?: { initial(tab: T): string; max: number; submit(tab: T, name: string, panel: string): void };
  /** 右クリックのメニュー（なければ土台の項目だけ） */
  Menu?: ComponentType<TabMenuProps<T>>;
  /** タブの見た目の足し替え（状態の印・動きの印・作業場所の札など、店を読むもの） */
  Face?: ComponentType<TabFaceProps<T>>;
  /** 中身を作る時が shown のタブを、表のタブの隣から手すきのときに先読みする */
  prefetch?(tabs: readonly T[]): void;
  /** 欄を初めて開くまで中身を作らない（復元したブラウザのタブ） */
  deferUntilPanelOpen?(tab: T): boolean;
  /** 中身の枠に足すクラス（AI が操作しているブラウザ。subscribe で変わりを知らせる） */
  pageClass?: { subscribe(listener: () => void): () => void; of(tab: T): string | undefined };
  /**
   * 別ウィンドウで開けるタブの行き先とウィンドウの名前（チャットの画面の右の欄のサブエージェント・変更・ファイル・ノート・子チャット、パネルのブラウザ・ターミナル）。
   * panel はタブのある欄（戻す先）。dismiss: 欄からは「表示だけ消した」ことにする（チャットのパネルとの連動で足し直さない）
   */
  popout?(tab: T, panel: string): { route: PopoutRoute; title: string; dismiss?: boolean };
  /** ほかのウィンドウから移ってきたタブを、このウィンドウのものにする（右サイドバーの受け渡し。ターミナルはシェルの持ち主をこのウィンドウにする） */
  onMoveToWindow?(tab: T): Promise<void> | void;
  /**
   * チャットの作業場所を移したときの付け替え（チャットの画面の右の欄の、作業場所を指すタブ）。移す前の作業場所のタブでなければ null、
   * 新しい作業場所のタブを返すか、付け替えずに残すとき（書きかけのファイル）は残したものの名前を kept で返す
   */
  repoint?(tab: T, move: WorkplaceMove, panel: string): T | { kept: string } | null;
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

// 欄の口: 欄ごとの決まり（入れる種類・Esc・ボタン・札・空になったとき）を 1 つの項目にまとめ、拡張点 panelSurfaces で受ける。
// 状態は panelKey(欄, 範囲) の住所ごとに店が覚える
import "./surface.css";
import type { LucideIcon } from "lucide-react";
import type { ComponentType, ReactNode } from "react";
import { definePoint } from "@/foundation/ui/points";
import type { SettingFamily } from "@/foundation/ui/storage";
import type { PanelTab } from "./panelTypes";
import type { PaneLayout, PaneLeaf } from "./layout/paneTree";
import type { TabGroupLookup } from "./kind";
import type { PanelController } from "./usePanel";

/**
 * 欄の名前（覚える状態の名前の頭）:
 * kanban = チャットのパネル（ボードの右・「チャット」タブ）/ side = 右サイドバー（ブラウザ）/ bottom = フッター（ターミナル）/
 * agents = チャットの画面の右の欄（チャットのタブの中に入れ子で置く）/ notes・files = プロジェクトの「ノート」「ファイル」タブの右 /
 * win = ブラウザの別ウィンドウ / cwin = チャットの別ウィンドウ
 */
const PANEL_SURFACE_IDS = ["kanban", "side", "bottom", "agents", "notes", "files", "win", "cwin"] as const;
export type PanelSurface = (typeof PANEL_SURFACE_IDS)[number];

/** 欄に出すタブのまとまり（chat = チャットと新しいチャット・file = ファイルとノート。サブエージェント・ファイルはチャットの画面の右の欄・ノートとファイルのタブの右だけ） */
export type PanelKind = "chat" | "browser" | "terminal" | "subagent" | "file";

/**
 * どの画面の欄か（プロジェクトの ID・全プロジェクトの画面 "all"。チャットの右の欄はチャットの ID）。
 * 覚えておく状態と、サイドバーと連動する範囲がこれで決まる
 */
export type PanelScope = number | "all" | DraftScope | ViewScope | WindowScope;

/** 送る前の新しいチャット（下書きのタブ）の右の欄の範囲（draft-<タブの key>）。送ってチャットができたら、そのチャットの右の欄へ中身を移す（moveDraftSidePanel） */
export type DraftScope = `draft-${string}`;

/**
 * 画面の中に入れ子で置いた、プロジェクトの画面と同じ部品の欄の範囲（view-<部品ごとの名前>。チャットの右の欄の「ファイル」タブの中のファイルのタブ。
 * プロジェクトの画面の欄とは別に持ち、アプリを閉じるまで覚える）
 */
export type ViewScope = `view-${string}`;

/**
 * ブラウザの別ウィンドウの欄の範囲（win-<プロジェクト>-<開いたタブのキー>。プロジェクトのないものは 0）。
 * どのプロジェクトのブラウザか（AI の操作の対象・右サイドバーに戻す先）を、欄の名前から読めるように入れておく
 */
export type WindowScope = `win-${number}-${string}`;

/** ブラウザの別ウィンドウの欄の範囲 */
export const windowScope = (projectId: number | null, tabKey: string): WindowScope => `win-${projectId ?? 0}-${tabKey}`;

/** 下書きのタブの右の欄の範囲 */
export const draftScope = (tabKey: string): DraftScope => `draft-${tabKey}`;

/** 欄の住所（"<欄>:<範囲>"） */
export const panelKey = (surface: PanelSurface, scope: PanelScope) => `${surface}:${scope}`;

/** 住所から、どの欄・どの画面のものか（知らない形なら undefined） */
export function parsePanelKey(key: string): { surface: PanelSurface; scope: PanelScope } | undefined {
  const at = key.indexOf(":");
  const surface = PANEL_SURFACE_IDS.find((s) => s === key.slice(0, at));
  const rest = key.slice(at + 1);
  const id = Number(rest);
  if (at < 0 || !surface) return undefined;
  if (rest === "all") return { surface, scope: "all" };
  if (rest.startsWith("draft-") && rest.length > 6) return { surface, scope: rest as DraftScope };
  if (rest.startsWith("view-") && rest.length > 5) return { surface, scope: rest as ViewScope };
  if (/^win-\d+-./.test(rest)) return { surface, scope: rest as WindowScope };
  return Number.isInteger(id) && id > 0 ? { surface, scope: id } : undefined;
}

/** 欄の拡張（欄の持ち主だけが読む値。チャットのパネルのサイドバーとの連動の覚え） */
export interface SurfaceExt<E> {
  initial: E;
  /** タブを開いたとき */
  onOpen?(ext: E, tab: PanelTab): E;
  /** タブを閉じたとき（dismiss: 利用者が閉じた） */
  onClose?(ext: E, closed: readonly PanelTab[], dismiss: boolean): E;
  /**
   * タブをそろえる（reducer の "sync" はこれを呼ぶ。input は欄の持ち主が決める）。変わらなければ同じ配列を返す。
   * 配置は reducer がそろえる（外れたタブは閉じたときと同じく隣を表示し、足したタブは一覧のペインへ）
   */
  sync?(tabs: readonly PanelTab[], ext: E, input: unknown): { tabs: readonly PanelTab[]; ext: E };
  /** ペインを閉じても閉じずに一覧のペインへ戻すタブか（サイドバーと連動したチャット） */
  linked?(ext: E, tab: PanelTab): boolean;
}

/** 欄が保存するタブと配置（SurfaceSpec.saved） */
export interface SavedTabs {
  tabs: readonly PanelTab[];
  layout: PaneLayout;
}


export interface SurfaceSpec<E = unknown> {
  id: PanelSurface;
  /** 欄の呼び名（AI の get_user_view が返す「どこのペインか」） */
  label: string;
  /** 入れられる種類（新しいタブのボタン・空の欄のボタン・ドラッグで受け入れる種類もこれ） */
  accepts: readonly PanelKind[];
  /**
   * Esc で閉じるか（ボードの右のパネル。チャット欄はページの中で Esc を使うので、フッターはターミナルの中で使うので閉じない）。
   * focused は、ピントが欄の中にあるときだけ閉じる（チャットの右の欄。外のチャットで押した Esc では閉じない）
   */
  closeOnEsc: boolean | "focused";
  /** 見せている最後のタブを閉じたとき（close = 欄も閉じる / keep = 開いたまま / closeWindow = ウィンドウごと閉じる（ウィンドウの殻が閉じる）） */
  whenEmpty: "close" | "keep" | "closeWindow";
  /**
   * タブを保存して、次に欄を作るときに戻す（右サイドバーのブラウザ。プロジェクトの欄だけ・保存するのは欄の持ち主のウィンドウだけ）。
   * write(…, null) はプロジェクトを消したとき
   */
  saved?: {
    read(projectId: number): SavedTabs | null;
    write(projectId: number, state: SavedTabs | null): void;
  };
  /** いつも開いておく（Esc・最後のタブを閉じても欄は閉じず、タブがなければ案内。ノート・ファイルのタブの右） */
  alwaysOpen?: boolean;
  /** 開いているかを覚える設定（プロジェクトごと）。なければアプリを閉じるまで覚える */
  openSetting?: SettingFamily<boolean>;
  /**
   * 閉じるボタン（start / end = タブの列の左の道具の先頭か最後、right = 右上のペインのタブの列の右端（分けるボタンの後ろ）。
   * なければ出さない: チャット欄は右上のレイアウトの開閉で閉じる）
   */
  /** keys は欄の中のキー（Esc）、command は開閉のコマンド（キーの表示をコマンドの表から出す） */
  closeButton?: { icon: LucideIcon; label: string; keys?: string; command?: string; at: "start" | "end" | "right" };
  /** 大きくする切り替え（width = 横幅いっぱい ⇔ 元の幅 / height = 最大化 ⇔ 元の高さ。大きさは欄の殻が持ち、Panel の frame で渡す） */
  maximize?: "width" | "height";
  /** false: タブの列の右端に分けるボタンを置かない（狭い欄。分けるのはタブのドラッグ・右クリック・⌘\ でできる） */
  splitButtons?: false;
  /** タブのすぐ右の新しいタブのボタン（なければ出さない: 中身は外から開くタブだけの欄） */
  Adds?: ComponentType<{ panel: PanelController; pane: PaneLeaf }>;
  /** タブの並べ方（なければ PlainStrip: ペインの並びのまま） */
  Strip?: ComponentType<StripProps>;
  /**
   * 「表示」のメニューの中身（左の道具のボタン・タブの列の何もないところの右クリックで開く。なければボタンも右クリックも出さない）。
   * tabMenu: タブの右クリックの「タブの表示 ›」の中（タブの表示の項目だけ）
   */
  ViewMenu?: ComponentType<{ panel: PanelController; tabMenu?: boolean }>;
  /** タブがないときの案内（なければ emptyHint の文。hint は emptyHint） */
  EmptyHint?: ComponentType<{ panel: PanelController; pane: PaneLeaf; hint: string | undefined }>;
  /** 新しいチャットのタブを送ってチャットができたとき（タブはできたチャットのタブに置き換えたあと） */
  onChatCreated?(chat: { id: number; project_id: number }): void;
  /** false: タブの種類の札（「ノート」「サブ」「子」）を付けない（1 つの種類しか並ばない欄） */
  kindBadges?: false;
  /** タブの列を隠せる欄か（チャットのパネル。設定の chatTabRowHidden で隠す。隠すとタブの列の道具も出ない） */
  hideableTabs?: boolean;
  /** タブがないときの案内の文 */
  emptyHint?: string;
  /** パネルに付けるクラス（欄ごとの見た目。as-sidebar = 欄いっぱいに置く（枠・影なし）/ in-footer = フッター） */
  className?: string;
  /** パネルの根のクラス（なければ board-panel）。入れ子の欄は別の名前にし、外側の欄の規則が効かないようにする */
  rootClass?: string;
  /** 開閉で幅が動く欄か（.slide-pane。画面そのものとして置くとき（frame.fixed。チャットタブ）は動かさない） */
  slide?: boolean;
  /** 欄の持ち主だけが読む値（サイドバーとの連動。なければチャットのタブをサイドバーの一覧にそろえない） */
  ext?: SurfaceExt<E>;
  /** 欄を描いている間、持ち主がタブをそろえる hook（チャットのパネルはサイドバーに出ているチャットに）。usePanel が欄ごとに 1 回だけ呼ぶ（欄は描いている間に変わらない） */
  sync?: { useSync(key: string, scope: PanelScope): void };
}

/** タブに出す項目とグループの引き方（並べ方が決める。なければどの項目も出し、グループは付けない） */
export interface TabLook {
  /** タブに出す項目か（項目の名前は欄の持ち主が決める。種類の Face が読む） */
  show(field: string): boolean;
  groupOf: TabGroupLookup;
}

/** 並べ方がタブの列の外枠に渡すもの（どれもなければ、ペインの並びのまま並べる） */
export interface StripOrder {
  /** タブの並びの左（横にスクロールしても動かない位置）に置くもの */
  lead?: ReactNode;
  /** まとまりごとに枠に入れて並べている */
  grouped?: boolean;
  /** 見た目の並びの位置をペインの並びの位置に直す（ドラッグで落としたとき） */
  toPaneIndex?(index: number): number;
  /** 同じペインの中で並びを別に決めているタブを落としたとき、その並びを変える（変えたら true。after: 前のタブの後ろに落とした） */
  reorder?(key: string, index: number, after: boolean): boolean;
}

/** 欄の Strip に渡すもの */
export interface StripProps {
  panel: PanelController;
  pane: PaneLeaf;
  /** 一覧のペインか（サイドバーと連動したチャットのタブが自動で入るペイン。分けていなければそのペイン） */
  home: boolean;
  /** ドラッグ中のタブのキー */
  dragging: string | null;
  /** タブ 1 つ（index は見た目の並びの位置・count は見た目の並びのタブの数。ドラッグで落とす位置の印もこの並びで付ける） */
  renderTab(key: string, index: number, count: number, look?: TabLook): ReactNode;
  /** 並べたタブを、タブの列の外枠（道具・新しいタブ・分けるボタン・ドラッグの受け口）に入れて返す */
  bar(content: ReactNode, order?: StripOrder): ReactNode;
}

/** どの欄も入る形（欄ごとに ext の型が違う項目を 1 つの点に並べる） */
export type AnySurface = SurfaceSpec<any>;

/** 欄を 1 つ作る（登録はしない） */
export const defineSurface = <E>(spec: SurfaceSpec<E>): SurfaceSpec<E> => spec;

/** 欄の拡張点（app/renderer/registry.ts が入れ、店を作るときに渡す） */
export const panelSurfaces = definePoint<AnySurface>("panelSurfaces", { key: (s) => s.id });

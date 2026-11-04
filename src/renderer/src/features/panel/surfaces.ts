import { PanelBottomClose, PanelRightClose, type LucideIcon } from "lucide-react";
import type { SettingFamily } from "@/lib/storage";
import { projectChatOpen } from "@/lib/storageKeys";
import type { PanelKind } from "./state/panelKinds";

/** タブの欄（board = ボードの右のパネル / side = 画面の右端のチャット欄 / bottom = フッター（下のパネル）） */
export type PanelSurface = "board" | "side" | "bottom";

/** どの画面の欄か（プロジェクトの ID・全プロジェクトの画面 "all"）。覚えておく状態と、サイドバーと連動する範囲がこれで決まる */
export type PanelScope = number | "all";

/** 欄ごとの決まり（作る側・描く側・中で別々に分岐させず、ここに集める） */
export interface SurfaceRules {
  /** 覚えておく状態の名前の頭（<頭>:<プロジェクト | all>。下書きの保存（kickoff:new-chat-drafts）のキーにも使うので変えない） */
  memoryPrefix: string;
  /** 初めに見せるタブの種類（タブの列の「表示するタブ」で変えるまで） */
  defaultKinds: readonly PanelKind[];
  /** Esc で閉じるか（ボードの右のパネルだけ。チャット欄は文字を打つ欄なので、フッターはターミナルの中で使うので閉じない） */
  closeOnEsc: boolean;
  /** 見せている最後のタブを閉じたら、欄も閉じるか（チャット欄は開いたまま、新しいタブのボタンを出す） */
  closeWhenEmpty: boolean;
  /** 見せるタブがないまま開いたときに始めるもの（チャット欄 = 新しいチャット / フッター = ターミナル（開く場所が 1 つのとき）） */
  openWhenEmpty: "newChat" | "terminal" | null;
  /** 開いているかを覚える設定（プロジェクトごと）。なければアプリを閉じるまで覚える */
  openSetting?: SettingFamily<boolean>;
  /** 閉じるボタン（タブの列の左の道具の先頭か最後。なければ出さない: チャット欄は右上のレイアウトの開閉で閉じる） */
  closeButton?: { icon: LucideIcon; label: string; keys: string; at: "start" | "end" };
  /** 大きくする切り替え（width = 横幅いっぱい ⇔ 元の幅 / height = 最大化 ⇔ 元の高さ。大きさは欄の殻が持ち、Panel の frame で渡す） */
  maximize?: "width" | "height";
  /** タブがないときに、新しいチャットのボタンの代わりに出す案内（分けていない欄だけ。ボードの右のパネル: 新しいチャットは見出しの「新規」から） */
  emptyHint?: string;
  /** タブの列の何もないところの右クリックで、ボードツールバーの置き方を選ぶか（ボードの右のパネルだけ） */
  layoutMenu?: boolean;
  /** パネルに付けるクラス（欄ごとの見た目。as-sidebar = 欄いっぱいに置く（枠・影なし）/ in-footer = フッター） */
  className?: string;
}

export const SURFACES: Record<PanelSurface, SurfaceRules> = {
  board: {
    memoryPrefix: "kanban",
    defaultKinds: ["chat"],
    closeOnEsc: true,
    closeWhenEmpty: true,
    openWhenEmpty: null,
    // 横から出てきたパネルを、横へしまう（タブはそのまま残る）
    closeButton: { icon: PanelRightClose, label: "パネルを閉じる", keys: "Esc", at: "start" },
    maximize: "width",
    emptyHint: "カードを押すと、ここにチャットが開きます。",
    layoutMenu: true,
  },
  side: {
    memoryPrefix: "side",
    defaultKinds: ["browser", "terminal"],
    closeOnEsc: false,
    closeWhenEmpty: false,
    openWhenEmpty: "newChat",
    openSetting: projectChatOpen,
    className: "as-sidebar",
  },
  bottom: {
    memoryPrefix: "bottom",
    defaultKinds: ["terminal", "browser"],
    closeOnEsc: false,
    closeWhenEmpty: true,
    openWhenEmpty: "terminal",
    closeButton: { icon: PanelBottomClose, label: "フッターを閉じる", keys: "⌃` / ⌘J", at: "end" },
    maximize: "height",
    className: "as-sidebar in-footer",
  },
};

const SURFACE_NAMES = Object.keys(SURFACES) as PanelSurface[];

/** 欄の状態を覚える名前（ボード = kanban:<プロジェクト | all>（列を状態で分けても・グループで分けても同じパネル）/ チャット欄 = side:<プロジェクト> / フッター = bottom:<プロジェクト | all>） */
export const panelKey = (surface: PanelSurface, scope: PanelScope) => `${SURFACES[surface].memoryPrefix}:${scope}`;

/** 覚える名前から、どの欄・どの画面のものか（知らない形なら undefined） */
export function parsePanelKey(key: string): { surface: PanelSurface; scope: PanelScope } | undefined {
  const at = key.indexOf(":");
  const surface = SURFACE_NAMES.find((s) => SURFACES[s].memoryPrefix === key.slice(0, at));
  const rest = key.slice(at + 1);
  const id = Number(rest);
  if (at < 0 || !surface) return undefined;
  if (rest === "all") return { surface, scope: "all" };
  return Number.isInteger(id) && id > 0 ? { surface, scope: id } : undefined;
}

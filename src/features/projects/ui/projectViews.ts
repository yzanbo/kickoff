// プロジェクトの画面の表（拡張点 projectViews）: ボード・チャット・ファイル・検索・変更・履歴・ノート・DB・Docker・GitHub・CI・ゴミ箱・ブラウザ。
// 持ち主の機能が ui/contributes.ts で登録し、真ん中のタブ（ProjectPage・ProjectTabs）・右サイドバー・チャットの右の欄が同じ表を引く
import type { LucideIcon } from "lucide-react";
import type { ComponentType, ReactNode } from "react";
import type { Project } from "@shared/projects/types";
import { definePoint } from "@/foundation/ui/points";
import type { PopoutRoute } from "@/foundation/ui/navigation/popout";
import type { FileTarget, ReopenRoute } from "@/foundation/ui/navigation/router";
import type { PanelFrame } from "@/features/panel/ui";
import type { TabGroup } from "./page/tabOrder";
import { inDesktopApp } from "./native";

/** 画面を置く場所（真ん中のタブ・右サイドバー・チャットの右の欄） */
export type ProjectViewPlace = "center" | "rightSidebar" | "chatSide";

/** タブの列のまとまり（同じまとまりは薄い地でつなぎ、外へはまとまりごと動かす） */
export const PROJECT_VIEW_GROUPS = ["work", "code", "notes", "db", "docker", "github", "ci", "trash", "browser"] as const;
export type ProjectViewGroup = (typeof PROJECT_VIEW_GROUPS)[number];
export const PROJECT_VIEW_GROUP_LABELS: Record<ProjectViewGroup, string> = {
  work: "チャット",
  code: "コード",
  notes: "ノート",
  db: "DB",
  docker: "Docker",
  github: "GitHub",
  ci: "CI",
  trash: "ゴミ箱",
  browser: "ブラウザ",
};

/** 画面を描くときに渡すもの */
export interface ProjectViewContext {
  /** 出しているプロジェクト（切り替えた直後は、届くまで前のプロジェクト） */
  project: Project;
  place: ProjectViewPlace;
  /** 描く画面の名前（いくつかの画面が同じ Page を使うとき、どれかを見分ける。同じ Page なら画面を替えても作り直さない） */
  view: string;
  /** 見ている作業場所（null = 本体） */
  worktree: string | null;
  setWorktree(path: string | null): void;
  /** 別のプロジェクトを読み込んでいる途中（URL で来たノート・ファイルを渡さない） */
  stale: boolean;
  /** 真ん中のチャットの URL（ボード・チャットだけ） */
  focus?: ReopenRoute;
  /** ほかから開くよう頼まれたファイル・ノート（1 回だけ） */
  openFile?: FileTarget;
  openNote?: string;
  openNoteLine?: number;
  /** 頼まれたファイル・ノートを開いたら呼ぶ（右サイドバーの頼みを片付ける） */
  takeRequest?(): void;
  /** チャットの右の欄のとき、どのチャットの右の欄か */
  chatId?: number;
  /** 欄の殻から渡すもの（右サイドバーの横幅いっぱいの切り替え） */
  frame?: PanelFrame;
}

/** チャットの右の欄のタブにするときの違い（places に chatSide がある画面） */
export interface ProjectViewChatSide {
  /** タブに乗せたときの説明（where はタブの作業場所の呼び名「本体」「ワークツリー x」。なければ「プロジェクトの「名前」（where から）」） */
  hint?(where: string): string;
  /** 右の欄の「＋ ▾」の項目の説明に添える中身（「プロジェクトの「名前」タブと同じ画面（about）を開く」） */
  about?: string;
  /** 余白と枠の包み（.project-content）なしで、欄の幅いっぱいに置く */
  bare?: boolean;
  /** 別ウィンドウで開く行き先とウィンドウの名前 */
  popout?(at: { chatId: number; projectId: number; worktree?: string }, where: string): { route: PopoutRoute; title: string };
}

/** タブの数（バッジ）を読む hook に渡すもの */
export interface ProjectViewBadgeProps {
  projectId: number;
  worktree: string | null;
  vertical: boolean;
  /** プロジェクトの画面のデータ（チャット・グループ）を読み込んでいる最中 */
  loading: boolean;
}

/** タブの数 */
export interface ProjectViewBadge {
  /** 数の説明（0 件なら null。縦並びの aria-label・乗せたときの説明に添える） */
  label: string | null;
  /** 横並びでも乗せたときの説明を数の説明にする */
  titled?: boolean;
  /** 取り直している最中（数の代わりに回る印） */
  refreshing: boolean;
  node: ReactNode;
}

export interface ProjectViewDef {
  /** URL の画面の名前・右サイドバーの中身の値（"board"・"files"…） */
  id: string;
  label: string;
  /** 乗せたときの名前（札より長く言うとき） */
  tip?: string;
  icon: LucideIcon;
  group: ProjectViewGroup;
  /** 初めの並び */
  order: number;
  /** この Mac のアプリの中だけ（ブラウザ・スマホからは出さない） */
  desktopOnly?: boolean;
  places: readonly ProjectViewPlace[];
  /** 作業場所に付く（WorkplaceProvider で包む。チャットの右の欄では作業場所を移したら付け替える） */
  followsWorkplace?: boolean;
  /** 右サイドバーで、ほかの中身を見ている間も隠して置く（ブラウザのページ・ログインの状態・書きかけを保つ）。右サイドバーの列ではいつも先頭 */
  keepAlive?: boolean;
  chatSide?: ProjectViewChatSide;
  /** チャットをボードと分ける置き方のときだけ出す（分けないときは into の画面が URL と数を受け持つ） */
  onlyWhenSeparate?: { into: string };
  /** 中身（作業場所・プロジェクトで作り直すなら、返す要素に key を付ける） */
  Page: ComponentType<ProjectViewContext>;
  /** タブの数（hook。描くタブごとに 1 回呼ぶ） */
  useBadge?(props: ProjectViewBadgeProps): ProjectViewBadge;
}

export const projectViews = definePoint<ProjectViewDef>("projectViews", { key: (v) => v.id, order: (a, b) => a.order - b.order });

/** このウィンドウで出せる画面か（この Mac のアプリの外では desktopOnly を出さない） */
export const canShowProjectView = (v: ProjectViewDef): boolean => !v.desktopOnly || inDesktopApp();

/** その置き場所で出せる画面（この Mac のアプリの外では desktopOnly を除く。置き方では絞らない） */
export const availableProjectViews = (place: ProjectViewPlace): ProjectViewDef[] => projectViews.items().filter((v) => v.places.includes(place) && canShowProjectView(v));

export const projectViewOf = (id: string): ProjectViewDef | undefined => projectViews.items().find((v) => v.id === id);

/** 並べ替えのまとまり（タブの列・右サイドバーの列。tab は画面の名前） */
export interface ProjectViewTabGroup extends TabGroup<ProjectViewTab> {
  label: string;
}
export interface ProjectViewTab {
  tab: string;
  def: ProjectViewDef;
}

/** 画面をまとまりごとに（初めの並び） */
export function projectViewGroups(views: readonly ProjectViewDef[]): ProjectViewTabGroup[] {
  const groups: ProjectViewTabGroup[] = [];
  for (const def of views) {
    const last = groups.at(-1);
    if (last?.key === def.group) (last.tabs as ProjectViewTab[]).push({ tab: def.id, def });
    else groups.push({ key: def.group, label: PROJECT_VIEW_GROUP_LABELS[def.group], tabs: [{ tab: def.id, def }] });
  }
  return groups;
}

/**
 * URL の画面の名前から出す画面（知らない名前・この Mac のアプリの外の desktopOnly・置き方が「分けない」ときの onlyWhenSeparate はボード = 初めの画面）
 */
export function resolveProjectView(id: string, separate: boolean): ProjectViewDef | undefined {
  const def = availableProjectViews("center").find((v) => v.id === id);
  if (def?.onlyWhenSeparate && !separate) return projectViewOf(def.onlyWhenSeparate.into);
  return def ?? availableProjectViews("center")[0];
}

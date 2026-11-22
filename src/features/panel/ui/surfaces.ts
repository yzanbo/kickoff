// 欄の住所から引く、欄によらない値（欄のプロジェクト・欄が出る画面）。欄の決まりは持ち主の機能の defineSurface
import type { Route } from "@/foundation/ui/navigation/router";
import { readSetting } from "@/foundation/ui/storage";
import { CHAT_PLACEMENT } from "@/foundation/ui/storage/storageKeys";
import { parsePanelKey } from "./surface";

/** 欄のプロジェクト（プロジェクトごとの欄でなければ null。チャットの右の欄の範囲はチャットの ID なので取り違えない） */
export function projectOfPanel(key: string): number | null {
  const at = parsePanelKey(key);
  // ブラウザの別ウィンドウは、範囲に入れたプロジェクト（0 はプロジェクトなし）
  if (at && typeof at.scope === "string" && at.scope.startsWith("win-")) return Number(at.scope.split("-")[1]) || null;
  return at && at.surface !== "agents" && typeof at.scope === "number" ? at.scope : null;
}

/**
 * その欄が出る画面（画面に出ていない欄の下書きを開くとき、ここへ移ってから開く）: 全プロジェクトの欄は全プロジェクトの画面、
 * プロジェクトの欄（チャット欄・フッター）はそのプロジェクトのボード。ボードの右のパネルは、チャットをボードと分けていれば
 * （設定の CHAT_PLACEMENT）「チャット」タブ、そうでなければボード。知らない形なら undefined
 */
export function panelScreen(key: string): Route | undefined {
  const at = parsePanelKey(key);
  // サブエージェントの欄はチャットの中にあり、下書きを持たないので移る先はない
  if (!at || at.surface === "agents") return undefined;
  if (at.scope === "all") return { name: "allProjects" };
  if (typeof at.scope !== "number") return undefined;
  if (at.surface === "notes") return { name: "project", id: at.scope, tab: "notes" };
  const chats = at.surface === "kanban" && readSetting(CHAT_PLACEMENT) === "separate";
  return { name: "project", id: at.scope, tab: chats ? "chats" : "board" };
}
export { parsePanelKey } from "./surface";

import { PanelBottomClose } from "lucide-react";
import type { Route } from "@/foundation/ui/navigation/router";
import { readSetting } from "@/foundation/ui/storage";
import { CHAT_PLACEMENT, projectChatOpen } from "@/foundation/ui/storage/storageKeys";
import { BrowserAdds, TerminalAdds } from "@/features/panel/ui/openWith/OpenWithAdds";
import { defineSurface, parsePanelKey, type AnySurface } from "./surface";

/**
 * 持ち主の機能へ移していない 5 つの欄（ui/contributes.ts が panelSurfaces に入れる。チャットのパネル・右の欄・チャットの別ウィンドウは chatPanel の chatSurfaces.ts）。
 * accepts は出すタブのまとまり（chat = チャットと新しいチャット・file = ファイルとノート）。空の欄のボタン・ドラッグで受け入れる種類もこれで決まる
 */
export const PANEL_SURFACES: readonly AnySurface[] = [
  // 右サイドバー（画面の右端のチャット欄。ブラウザだけ）
  defineSurface({
    id: "side",
    accepts: ["browser"],
    closeOnEsc: false,
    // 最後のブラウザのタブを閉じたら閉じる（下のパネルの最後のターミナルと同じ）
    whenEmpty: "close",
    openSetting: projectChatOpen,
    // 横幅いっぱい ⇔ 元の幅（タブの列の左端。チャットの画面の右の欄と同じ）
    maximize: "width",
    // 狭い欄なので、右・下に分けるボタンは置かない（分けるのはタブのドラッグ・右クリック・⌘\）
    splitButtons: false,
    className: "as-sidebar",
    Adds: BrowserAdds,
  }),
  // フッター（下のパネル。ターミナルだけ）
  defineSurface({
    id: "bottom",
    accepts: ["terminal"],
    closeOnEsc: false,
    whenEmpty: "close",
    openWhenEmpty: "terminal",
    closeButton: { icon: PanelBottomClose, label: "フッターを閉じる", keys: "⌃` / ⌘J", at: "end" },
    maximize: "height",
    className: "as-sidebar in-footer",
    Adds: TerminalAdds,
  }),
  // ブラウザの別ウィンドウ: ブラウザだけ。最後のタブを閉じたらウィンドウごと閉じる（Chrome と同じ。ウィンドウの殻 popout/tabWindow.ts）
  defineSurface({
    id: "win",
    accepts: ["browser"],
    closeOnEsc: false,
    whenEmpty: "closeWindow",
    splitButtons: false,
    className: "as-sidebar",
    Adds: BrowserAdds,
  }),
  // プロジェクトの「ノート」タブの右（開いたノートをタブで並べる。左の一覧から開く。ノートのタブは「ファイル」のまとまりに入る）
  defineSurface({
    id: "notes",
    accepts: ["file"],
    closeOnEsc: false,
    whenEmpty: "keep",
    emptyHint: "左の一覧でノートを押すと、ここに開きます（⌘クリックで新しいタブ）。タブをドラッグすると、上下・左右に分けて並べられます。",
    kindBadges: false,
    className: "note-panel",
  }),
  // プロジェクトの「ファイル」「検索」「変更」タブの右（開いたファイル・差分をタブで並べる。左の一覧から開く）
  defineSurface({
    id: "files",
    accepts: ["file"],
    closeOnEsc: false,
    whenEmpty: "keep",
    emptyHint: "左の一覧でファイルを押すと、ここに開きます（⌘クリックで新しいタブ）。タブをドラッグすると、上下・左右に分けて並べられます。",
    kindBadges: false,
    className: "file-panel",
  }),
];

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

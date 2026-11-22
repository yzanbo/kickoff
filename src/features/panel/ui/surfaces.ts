import { PanelBottomClose, PanelRightClose } from "lucide-react";
import type { Route } from "@/foundation/ui/navigation/router";
import { readSetting } from "@/foundation/ui/storage";
import { CHAT_PLACEMENT, projectChatOpen } from "@/foundation/ui/storage/storageKeys";
import { linkedChatsExt } from "./state/panelState";
import { defineSurface, parsePanelKey, type AnySurface } from "./surface";

/**
 * いまの 8 つの欄（持ち主の機能へ移すまで panel に置く。ui/contributes.ts が panelSurfaces に入れる）。
 * accepts は出すタブのまとまり（chat = チャットと新しいチャット・file = ファイルとノート）。新しいタブ・空の欄のボタン・ドラッグで受け入れる種類もこれで決まる
 */
export const PANEL_SURFACES: readonly AnySurface[] = [
  // チャットのパネル（ボードの右・「チャット」タブ）。サイドバーに出ているチャットのタブをそろえる
  defineSurface({
    id: "kanban",
    accepts: ["chat"],
    closeOnEsc: true,
    whenEmpty: "close",
    // 横から出てきたパネルを、横へしまう（タブはそのまま残る）
    closeButton: { icon: PanelRightClose, label: "パネルを閉じる", keys: "Esc", at: "start" },
    maximize: "width",
    hideableTabs: true,
    emptyHint: "カードを押すと、ここにチャットが開きます。",
    slide: true,
    ext: linkedChatsExt,
  }),
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
  }),
  // チャットの画面の右の欄（サブエージェントの画面と、変更したファイル・返答に出てきたファイルを並べる。チャットのタブの中に入れ子で置く）
  defineSurface({
    id: "agents",
    accepts: ["subagent", "file"],
    closeOnEsc: "focused",
    whenEmpty: "close",
    closeButton: { icon: PanelRightClose, label: "右の欄を閉じる", keys: "Esc", at: "right" },
    splitButtons: false,
    // 左の会話を覆って横幅いっぱいに広げる ⇔ 元の幅に戻す（タブの列の左端）
    maximize: "width",
    emptyHint:
      "サブエージェントのカードの「右の欄で開く」・変更したファイル・返答のファイルのチップ・子チャットとノートの札を押すと、ここに開きます。タブをドラッグすると、上下・左右に分けて並べられます。",
    newChildHint: "「＋」で新しい子チャットを始められます。",
    tabAdds: false,
    newChild: true,
    rootClass: "agent-panel",
    slide: true,
  }),
  // ブラウザの別ウィンドウ: ブラウザだけ。最後のタブを閉じたらウィンドウごと閉じる（Chrome と同じ。ウィンドウの殻 popout/tabWindow.ts）
  defineSurface({
    id: "win",
    accepts: ["browser"],
    closeOnEsc: false,
    whenEmpty: "closeWindow",
    splitButtons: false,
    className: "as-sidebar",
  }),
  // チャットの別ウィンドウ: チャットだけ。サイドバーとそろえず（ext なし）、移した・ドラッグで足したチャットだけ。最後のタブがなくなればウィンドウごと閉じる（popout/tabWindow.ts）
  defineSurface({
    id: "cwin",
    accepts: ["chat"],
    closeOnEsc: false,
    whenEmpty: "closeWindow",
    splitButtons: false,
    tabAdds: false,
    className: "as-sidebar",
  }),
  // プロジェクトの「ノート」タブの右（開いたノートをタブで並べる。左の一覧から開く。ノートのタブは「ファイル」のまとまりに入る）
  defineSurface({
    id: "notes",
    accepts: ["file"],
    closeOnEsc: false,
    whenEmpty: "keep",
    emptyHint: "左の一覧でノートを押すと、ここに開きます（⌘クリックで新しいタブ）。タブをドラッグすると、上下・左右に分けて並べられます。",
    tabAdds: false,
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
    tabAdds: false,
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

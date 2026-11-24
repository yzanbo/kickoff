// プロジェクトの「ノート」タブの右の欄の決まり（開いたノートをタブで並べる。左の一覧から開く。ノートのタブは「ファイル」のまとまりに入る）。ui/contributes.ts が panelSurfaces に入れる
import { defineSurface } from "@/features/panel/ui";

export const noteSurface = defineSurface({
  id: "notes",
  label: "ノートのタブ",
  accepts: ["file"],
  closeOnEsc: false,
  whenEmpty: "keep",
  alwaysOpen: true,
  emptyHint: "左の一覧でノートを押すと、ここに開きます（⌘クリックで新しいタブ）。タブをドラッグすると、上下・左右に分けて並べられます。",
  kindBadges: false,
  className: "note-panel",
});

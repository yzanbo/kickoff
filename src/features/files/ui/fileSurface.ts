// プロジェクトの「ファイル」「検索」「変更」タブの右の欄の決まり（開いたファイル・差分をタブで並べる。左の一覧から開く）。ui/contributes.ts が panelSurfaces に入れる
import { defineSurface } from "@/features/panel/ui";

export const fileSurface = defineSurface({
  id: "files",
  label: "ファイルのタブ",
  accepts: ["file"],
  closeOnEsc: false,
  whenEmpty: "keep",
  alwaysOpen: true,
  emptyHint: "左の一覧でファイルを押すと、ここに開きます（⌘クリックで新しいタブ）。タブをドラッグすると、上下・左右に分けて並べられます。",
  kindBadges: false,
  className: "file-panel",
});

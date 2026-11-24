// ブラウザの欄 2 つ（ui/contributes.ts が panelSurfaces に入れる）: 右サイドバー（side）とブラウザの別ウィンドウ（win）
import { projectChatOpen } from "@/foundation/ui/storage/storageKeys";
import { BrowserAdds, defineSurface } from "@/features/panel/ui";
import { readBrowserSession, writeBrowserSession } from "./browserSession";

/** 右サイドバー（画面の右端のチャット欄。ブラウザだけ。タブ・配置はプロジェクトごとに残す） */
export const sideSurface = defineSurface({
  id: "side",
  label: "右サイドバー",
  accepts: ["browser"],
  closeOnEsc: false,
  // 最後のブラウザのタブを閉じたら閉じる（下のパネルの最後のターミナルと同じ）
  whenEmpty: "close",
  openSetting: projectChatOpen,
  saved: { read: readBrowserSession, write: writeBrowserSession },
  // 横幅いっぱい ⇔ 元の幅（タブの列の左端。チャットの画面の右の欄と同じ）
  maximize: "width",
  // 狭い欄なので、右・下に分けるボタンは置かない（分けるのはタブのドラッグ・右クリック・⌘\）
  splitButtons: false,
  className: "as-sidebar",
  Adds: BrowserAdds,
});

/** ブラウザの別ウィンドウ: ブラウザだけ。最後のタブを閉じたらウィンドウごと閉じる（Chrome と同じ。ウィンドウの殻は panel の popout/tabWindow.ts） */
export const browserWindowSurface = defineSurface({
  id: "win",
  label: "ブラウザの別ウィンドウ",
  accepts: ["browser"],
  closeOnEsc: false,
  whenEmpty: "closeWindow",
  splitButtons: false,
  className: "as-sidebar",
  Adds: BrowserAdds,
});

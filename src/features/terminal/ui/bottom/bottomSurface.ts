// フッター（下のパネル）の欄（ui/contributes.ts が panelSurfaces に入れる）。殻は BottomPanel・useBottomPanel
import { PanelBottomClose } from "lucide-react";
import { defineSurface, TerminalAdds } from "@/features/panel/ui";

/** フッター: ターミナルだけ。最後のタブを閉じたら閉じる・Esc では閉じない（ターミナルの中で使う）。開いたときにタブがなければ殻がターミナルを始める（useBottomPanel の toggle） */
export const bottomSurface = defineSurface({
  id: "bottom",
  label: "下のパネル",
  accepts: ["terminal"],
  closeOnEsc: false,
  whenEmpty: "close",
  closeButton: { icon: PanelBottomClose, label: "フッターを閉じる", keys: "⌃` / ⌘J", at: "end" },
  maximize: "height",
  className: "as-sidebar in-footer",
  Adds: TerminalAdds,
});

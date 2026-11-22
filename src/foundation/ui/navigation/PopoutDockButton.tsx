import { PanelLeft, PanelRight } from "lucide-react";
import { dockAndClose, parsePopout, popoutKindOf, type PopoutDockLabel, type PopoutKind, type PopoutRoute } from "./popout";

/** 種類が決めていないときの名前と説明 */
const RIGHT_PANE: PopoutDockLabel = { label: "右の欄に戻す", tip: "メインのウィンドウの、チャットの画面の右の欄で開き直して、このウィンドウを閉じる" };

/**
 * 別ウィンドウの「右の欄に戻す」: 中身をメインのウィンドウの元の欄で開き直し（種類の dock）、開き直し終えた知らせを待ってから、このウィンドウを閉じる
 * （閉じ方は聞かない）。戻し方・名前は種類の項目（returnSelf・beforeDock・dockLabel）が決める
 */
export function PopoutDockButton({ route }: { route: PopoutRoute }) {
  const kind = popoutKindOf(route.kind) as PopoutKind | undefined;
  const { label, tip, left } = kind?.dockLabel?.(route as never) ?? RIGHT_PANE;
  return (
    <button
      type="button"
      className="btn"
      data-size="sm"
      title={tip}
      onClick={() => {
        if (kind?.returnSelf) return kind.returnSelf(route as never);
        kind?.beforeDock?.();
        // ページを移ると URL のハッシュも変わるものがあるので、いまの行き先で戻す
        dockAndClose(parsePopout(location.hash) ?? route);
      }}
    >
      {left ? <PanelLeft size={13} aria-hidden /> : <PanelRight size={13} aria-hidden />} {label}
    </button>
  );
}

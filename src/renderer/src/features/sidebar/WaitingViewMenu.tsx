import { Check } from "lucide-react";
import type { Placement } from "@/lib/floating";
import { MenuItem, PopupMenu } from "@/ui/PopupMenu";
import { WAITING_ORDERS, WAITING_SCOPES, waitingAxes, waitingViewOf, type WaitingView } from "./waitingAxes";
import { WAITING_ORDER_META, WAITING_SCOPE_META } from "./waitingView";

/**
 * 上の行の「自分待ち」の右クリック: 自分待ちの表示を、出し方（自分待ちだけ / 上にまとめる）と並べ方（プロジェクト別 / 状態順）の 2 つのまとまりで選ぶ
 * （見出しの「自分待ち」の行の 2 つの切り替えと同じ）。選ぶと自分待ちをオンにする（onPick）
 */
export function WaitingViewMenu({ at, view, ignore, onPick, onClose }: { at: Placement; view: WaitingView; ignore?: string; onPick: (view: WaitingView) => void; onClose: () => void }) {
  const { scope, order } = waitingAxes(view);
  return (
    <PopupMenu at={at} label="自分待ちの表示" ignore={ignore} onClose={onClose}>
      <div className="menu-label">自分待ちの出し方</div>
      {WAITING_SCOPES.map((s) => {
        const { icon: Icon, label } = WAITING_SCOPE_META[s];
        return (
          <MenuItem key={s} role="menuitemradio" checked={s === scope} onSelect={() => onPick(waitingViewOf(s, order))}>
            <Icon size={14} aria-hidden />
            <span className="project-switch-item">{label}</span>
            {s === scope && <Check size={14} aria-hidden />}
          </MenuItem>
        );
      })}
      <div className="menu-separator" role="separator" />
      <div className="menu-label">自分待ちの並べ方</div>
      {WAITING_ORDERS.map((o) => {
        const { icon: Icon, label } = WAITING_ORDER_META[o];
        return (
          <MenuItem key={o} role="menuitemradio" checked={o === order} onSelect={() => onPick(waitingViewOf(scope, o))}>
            <Icon size={14} aria-hidden />
            <span className="project-switch-item">{label}</span>
            {o === order && <Check size={14} aria-hidden />}
          </MenuItem>
        );
      })}
    </PopupMenu>
  );
}

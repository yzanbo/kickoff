import { Check } from "lucide-react";
import type { Placement } from "@/lib/floating";
import { MenuItem, PopupMenu } from "@/ui/PopupMenu";
import { canChooseOrder, WAITING_ORDERS, WAITING_SCOPES, waitingAxes, waitingViewOf, type WaitingView } from "./waitingAxes";
import { WAITING_ORDER_META, WAITING_SCOPE_META } from "./waitingView";

/**
 * 上の行の「自分待ち」の右クリック: 自分待ちの表示を、出し方（自分待ちだけ / 一覧の上に / プロジェクト内の上に）と並べ方（プロジェクト別 / 状態順）の
 * 2 つのまとまりで選ぶ（見出しの「自分待ち」の行と同じ。プロジェクト内の上にでは並べ方を選べない）。選ぶと自分待ちをオンにする（onPick）
 */
export function WaitingViewMenu({ at, view, ignore, onPick, onClose }: { at: Placement; view: WaitingView; ignore?: string; onPick: (view: WaitingView) => void; onClose: () => void }) {
  const { scope, order } = waitingAxes(view);
  const orderFree = canChooseOrder(scope);
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
          <MenuItem
            key={o}
            role="menuitemradio"
            checked={o === order}
            disabled={!orderFree}
            title={orderFree ? undefined : "プロジェクト内の上にまとめるときは、プロジェクト別だけです（中は状態順）"}
            onSelect={() => onPick(waitingViewOf(scope, o))}
          >
            <Icon size={14} aria-hidden />
            <span className="project-switch-item">{label}</span>
            {o === order && <Check size={14} aria-hidden />}
          </MenuItem>
        );
      })}
    </PopupMenu>
  );
}

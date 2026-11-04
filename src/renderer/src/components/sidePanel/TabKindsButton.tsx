import { Check, Eye } from "lucide-react";
import { MenuItem, PopupMenu } from "../PopupMenu";
import { useAnchoredMenu } from "../menus/useAnchoredMenu";
import { PANEL_KINDS, PANEL_KIND_LABELS } from "./panelKinds";
import type { SidePanelController } from "./useSidePanel";

const MENU_WIDTH = 200;

/**
 * 欄で表示するタブの種類（チャット・ブラウザ・ターミナル）を選ぶボタン（タブのまとめ方のすぐ右）。
 * 押すと下にチェックのメニューを開き、押すたびに付け外しする（欄ごとに覚える。最後の 1 つは外せない）。
 * 隠した種類のタブは閉じずに残すので、表示に戻すと元どおり出る
 */
export function TabKindsButton({ panel }: { panel: SidePanelController }) {
  const { kinds } = panel;
  // 欄ごとにボタンを分ける（ほかの欄のボタンを押したときは、こちらのメニューを外側のクリックとして閉じる）
  const selector = `.panel-tab-kinds-${panel.surface}`;
  const menu = useAnchoredMenu(selector, MENU_WIDTH);
  const label = `表示するタブ: ${kinds.kinds.map((k) => PANEL_KIND_LABELS[k]).join("・")}`;
  return (
    <>
      <button
        type="button"
        className={`panel-control panel-tab-kinds-${panel.surface}`}
        title={`${label}（チャット・ブラウザ・ターミナルから選ぶ）`}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={menu.isOpen}
        onClick={(e) => menu.toggle(e, 130)}
      >
        <Eye size={15} />
      </button>
      {menu.at && (
        <PopupMenu x={menu.at.x} y={menu.at.y} label="表示するタブ" ignore={menu.ignore} onClose={menu.close}>
          <div className="menu-label">表示するタブ</div>
          {PANEL_KINDS.map((k) => {
            const on = kinds.has(k);
            const last = on && kinds.kinds.length === 1;
            return (
              <MenuItem
                key={k}
                role="menuitemcheckbox"
                checked={on}
                title={last ? "1 つは表示しておきます" : on ? `${PANEL_KIND_LABELS[k]}のタブを隠す（閉じずに残します）` : `${PANEL_KIND_LABELS[k]}のタブを表示する`}
                onSelect={() => kinds.toggle(k)}
              >
                <span className="project-switch-item">{PANEL_KIND_LABELS[k]}</span>
                {on && <Check size={14} aria-hidden />}
              </MenuItem>
            );
          })}
        </PopupMenu>
      )}
    </>
  );
}

import { Check, Eye } from "lucide-react";
import { IconButton } from "@/ui/IconButton";
import { MenuItem, PopupMenu } from "@/ui/PopupMenu";
import { useContextMenu } from "@/ui/useContextMenu";
import { PANEL_KINDS, PANEL_KIND_LABELS } from "@/features/panel/state/panelKinds";
import type { PanelController } from "@/features/panel/usePanel";

/**
 * 欄で表示するタブの種類（チャット・ブラウザ・ターミナル）を選ぶボタン（タブのまとめ方のすぐ右）。
 * 押すと下にチェックのメニューを開き、押すたびに付け外しする（欄ごとに覚える。最後の 1 つは外せない）。
 * 隠した種類のタブは閉じずに残すので、表示に戻すと元どおり出る
 */
export function TabKindsButton({ panel }: { panel: PanelController }) {
  const { kinds } = panel;
  // 欄ごとにボタンを分ける（ほかの欄のボタンを押したときは、こちらのメニューを外側のクリックとして閉じる）
  const selector = `.panel-tab-kinds-${panel.surface}`;
  const menu = useContextMenu();
  const label = `表示するタブ: ${kinds.kinds.map((k) => PANEL_KIND_LABELS[k]).join("・")}`;
  return (
    <>
      <IconButton
        type="button"
        icon={Eye}
        size={15}
        className={`panel-control panel-tab-kinds-${panel.surface}`}
        label={label}
        title={`${label}（チャット・ブラウザ・ターミナルから選ぶ）`}
        aria-haspopup="menu"
        aria-expanded={menu.isOpen}
        onClick={menu.toggle}
      />
      {menu.menu && (
        <PopupMenu at={menu.menu.at} label="表示するタブ" ignore={selector} onClose={menu.close}>
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

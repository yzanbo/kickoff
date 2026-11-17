import { Check, ChevronDown } from "lucide-react";
import type { ProviderId } from "@shared/types";
import { ProviderIcon } from "@/features/chat/provider/ProviderIcon";
import { MenuItem, PopupMenu } from "@/ui/PopupMenu";
import { useContextMenu } from "@/ui/useContextMenu";
import type { SelectableUsage } from "./usageSelection";

/** 使用状況の表示先。色とアイコンは表示中の AI で決め、選択の自動・一時表示とは分ける。 */
export function UsageProviderPicker({ provider, label, temporary, onSelect }: {
  provider: ProviderId;
  label: string;
  temporary: SelectableUsage | null;
  onSelect: (provider: SelectableUsage | null) => void;
}) {
  const menu = useContextMenu({ side: "above", align: "start", gap: 8 });
  return (
    <>
      <button
        type="button"
        className="plan-chip footer-usage-picker"
        data-provider={provider}
        aria-label={`使用状況の表示先: ${label}${temporary ? "・一時表示" : "・チャットに連動"}`}
        aria-haspopup="menu"
        aria-expanded={menu.isOpen}
        title="表示する AI の使用状況を切り替える"
        onClick={(e) => menu.toggle(e, undefined)}
      >
        <span className="footer-usage-provider-icon"><ProviderIcon provider={provider} size={14} /></span>
        <span>{label}</span>{temporary && <span className="footer-usage-temporary">· 一時表示</span>} <ChevronDown size={12} aria-hidden />
      </button>
      {menu.menu && (
        <PopupMenu at={menu.menu.at} label="使用状況の表示先" ignore=".footer-usage-picker" onClose={menu.close}>
          <MenuItem role="menuitemradio" checked={temporary === null} onSelect={() => onSelect(null)}>
            <span className="project-switch-item">チャットに戻す（自動）</span>{temporary === null && <Check size={14} aria-hidden />}
          </MenuItem>
          {([ ["claude", "Claude Code"], ["codex", "Codex"] ] as const).map(([provider, name]) => (
            <MenuItem key={provider} role="menuitemradio" checked={temporary === provider} onSelect={() => onSelect(provider)}>
              <span className="footer-usage-menu-provider" data-provider={provider}><ProviderIcon provider={provider} size={14} /></span>
              <span className="project-switch-item">{name}</span>{temporary === provider && <Check size={14} aria-hidden />}
            </MenuItem>
          ))}
        </PopupMenu>
      )}
    </>
  );
}

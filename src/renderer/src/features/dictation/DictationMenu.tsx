import { useState, type MouseEvent } from "react";
import { Check, Settings } from "lucide-react";
import { VOICE_LANGUAGES } from "@shared/types";
import { api } from "@/api";
import { useSetting } from "@/hooks/useSetting";
import { VOICE_MIC_DEVICE } from "@/lib/storageKeys";
import { settingsStore, useAppSettings } from "@/stores/settings";
import { reportFailure } from "@/ui/dialogs";
import { MenuItem, PopupMenu } from "@/ui/PopupMenu";
import { useContextMenu } from "@/ui/useContextMenu";
import { openSettings } from "@/features/settings/openSettings";
import { listMics } from "./recorder";

/** ▾ を押したときに、開いているメニューを外側のクリックとして閉じない（押したボタンの側で開閉する） */
const OPENER = ".dictation-more";

/**
 * 音声入力の設定のメニュー（マイクの右の ▾ と、マイクの右クリック）: 使うマイク（この Mac に保存。見つからなければ既定）・
 * 話す言語（設定の「音声入力」と同じ値をすぐ保存）・設定の「音声入力」を開く
 */
export function useDictationMenu() {
  const menu = useContextMenu({ align: "start", side: "above" });
  const [mics, setMics] = useState<{ id: string; label: string }[]>([]);
  const [device, setDevice] = useSetting(VOICE_MIC_DEVICE);
  const settings = useAppSettings().data;
  const show = (open: () => void) => {
    open();
    // 開くたびに一覧を読み直す（つないだ・外したマイクを出す）
    void listMics().then(setMics, () => setMics([]));
  };
  const setLanguage = (language: string) =>
    void api.updateSettings({ voice_language: language }).then(settingsStore.set, reportFailure("話す言語を変えられませんでした"));

  const element = menu.menu && (
    <PopupMenu at={menu.menu.at} label="音声入力の設定" ignore={OPENER} onClose={menu.close}>
      <div className="menu-label">使うマイク</div>
      <RadioItem checked={!device} onSelect={() => setDevice("")} label="Mac の既定のマイク" />
      {mics.map((m) => (
        <RadioItem key={m.id} checked={device === m.id} onSelect={() => setDevice(m.id)} label={m.label} />
      ))}
      {device && !mics.some((m) => m.id === device) && mics.length > 0 && (
        <div className="menu-label muted">選んだマイクが見つかりません（既定のマイクで録ります）</div>
      )}
      <div className="menu-separator" role="separator" />
      <div className="menu-label">話す言語</div>
      {VOICE_LANGUAGES.map((l) => (
        <RadioItem key={l.value} checked={settings?.voice_language === l.value} disabled={!settings} onSelect={() => setLanguage(l.value)} label={l.label} />
      ))}
      <div className="menu-separator" role="separator" />
      <MenuItem onSelect={() => openSettings("voice")}>
        <Settings size={14} aria-hidden />
        音声入力の設定を開く…
      </MenuItem>
    </PopupMenu>
  );
  return {
    element,
    /** マイクの右クリック */
    open: (e: MouseEvent) => show(() => menu.open(e, undefined)),
    /** ▾ を押した（開いていれば閉じる） */
    toggle: (e: MouseEvent<HTMLElement>) => (menu.isOpen ? menu.close() : show(() => menu.openBelow(e, undefined))),
    isOpen: menu.isOpen,
  };
}

/** 1 つを選ぶ項目（選んでいるものの右に ✓） */
function RadioItem({ label, checked, disabled, onSelect }: { label: string; checked: boolean; disabled?: boolean; onSelect: () => void }) {
  return (
    <MenuItem role="menuitemradio" checked={checked} disabled={disabled} onSelect={onSelect}>
      <span className="project-switch-item">{label}</span>
      {checked && <Check size={14} aria-hidden />}
    </MenuItem>
  );
}

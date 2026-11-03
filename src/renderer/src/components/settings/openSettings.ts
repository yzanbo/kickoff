import type { SettingsSection } from "./SettingsDialog";

/** 設定のダイアログを、その項目で開く（App が受け取る。チャット欄のマイクから「音声入力」を開くときなど） */
export const OPEN_SETTINGS_EVENT = "kickoff:open-settings";

export function openSettings(section: SettingsSection) {
  window.dispatchEvent(new CustomEvent<SettingsSection>(OPEN_SETTINGS_EVENT, { detail: section }));
}

import { openAppDialog } from "@/foundation/ui/shell/points";
import type { SettingsSection } from "./SettingsDialog";

declare module "@/foundation/ui/shell/points" {
  interface AppDialogMap {
    /** 設定のダイアログ（開く項目。開いていれば、その項目に切り替える） */
    settings: SettingsSection;
  }
}

/** 設定のダイアログを、その項目で開く（App が受け取る。チャット欄のマイクから「音声入力」を開くときなど。別ウィンドウからはメインのウィンドウで） */
export function openSettings(section: SettingsSection) {
  openAppDialog("settings", section);
}

import { openAppDialog } from "@/foundation/ui/shell/points";

declare module "@/foundation/ui/shell/points" {
  interface AppDialogMap {
    /** 設定のダイアログ（開く節の id = settingsSections の id。開いていれば、その節に切り替える） */
    settings: string;
  }
}

/** 設定のダイアログを、その節で開く（App が受け取る。チャット欄のマイクから「音声入力」を開くときなど。別ウィンドウからはメインのウィンドウで） */
export function openSettings(section: string) {
  openAppDialog("settings", section);
}

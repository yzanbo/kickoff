// settings がアプリの根に置く物: 設定のダイアログ（開いていれば頼まれた節で開き直す）
import { createElement } from "react";
import type { AppHost } from "@/foundation/ui/shell/points";
import { SettingsDialog } from "./SettingsDialog";

export const settingsHost: AppHost = {
  id: "settings",
  windows: "main",
  order: 90,
  dialog: { id: "settings", Dialog: ({ detail, onClose }) => createElement(SettingsDialog, { key: detail as string, initial: detail as string, onClose }) },
};

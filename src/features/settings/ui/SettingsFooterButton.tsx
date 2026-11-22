import { Settings } from "lucide-react";
import { useCommandKeys } from "@/foundation/ui/commands";
import { IconButton } from "@/foundation/ui/kit/IconButton";
import { openSettings } from "./openSettings";

/** 下の帯の設定の歯車（ダイアログで開く。サイドバーを閉じていても開ける） */
export function SettingsFooterButton() {
  const settingsKeys = useCommandKeys("settings.open");
  return <IconButton icon={Settings} label="設定" title={`設定（${settingsKeys}）`} className="footer-settings" onClick={() => openSettings("usage")} />;
}

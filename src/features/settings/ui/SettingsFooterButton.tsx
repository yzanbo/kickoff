import { Settings } from "lucide-react";
import { useCommandKeys } from "@/foundation/ui/commands";
import { IconButton } from "@/foundation/ui/kit/IconButton";
import { openSettings } from "./openSettings";
import { SETTINGS_SLOTS, settingsItemsOf } from "./points";

/** 下の帯の設定の歯車（ダイアログで開く。サイドバーを閉じていても開ける）。上の機能の印（新しい版があるなど）を重ねる */
export function SettingsFooterButton() {
  const settingsKeys = useCommandKeys("settings.open");
  const badges = settingsItemsOf(SETTINGS_SLOTS.buttonBadge).map(({ id, Component }) => <Component key={id} />);
  return <IconButton icon={Settings} label="設定" title={`設定（${settingsKeys}）`} className="footer-settings" badge={badges} onClick={() => openSettings("usage")} />;
}

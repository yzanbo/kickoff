import { TabbedDialog } from "@/foundation/ui/kit/TabbedDialog";
import { SETTINGS_SLOTS, settingsItemsOf, settingsSectionsOf } from "./points";

/** アプリの設定（左下の歯車・⌘, から開く。プロジェクトの編集と同じ形のダイアログ）。節は持ち主の機能が settingsSections に scope: "app" で入れたものを order の順に並べる */
export function SettingsDialog({ initial, onClose }: { initial?: string; onClose: () => void }) {
  const sections = settingsSectionsOf("app");
  // いちばん上の帯（上の機能が section: SETTINGS_SLOTS.dialogTop で入れる。出すものがなければ何も描かない）
  const banner = settingsItemsOf(SETTINGS_SLOTS.dialogTop).map(({ id, Component }) => <Component key={id} onClose={onClose} />);
  return (
    <TabbedDialog title="設定" label="設定の項目" sections={sections.map(({ id, label, icon }) => ({ key: id, label, icon }))} initial={initial} onClose={onClose} banner={banner}>
      {(section) => {
        const Component = sections.find((s) => s.id === section)?.Component;
        return Component && <Component onClose={onClose} />;
      }}
    </TabbedDialog>
  );
}

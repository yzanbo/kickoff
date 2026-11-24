import { TabbedDialog } from "@/foundation/ui/kit/TabbedDialog";
import { settingsSectionsOf } from "./points";

/** アプリの設定（左下の歯車・⌘, から開く。プロジェクトの編集と同じ形のダイアログ）。節は持ち主の機能が settingsSections に scope: "app" で入れたものを order の順に並べる */
export function SettingsDialog({ initial, onClose }: { initial?: string; onClose: () => void }) {
  const sections = settingsSectionsOf("app");
  return (
    <TabbedDialog title="設定" label="設定の項目" sections={sections.map(({ id, label, icon }) => ({ key: id, label, icon }))} initial={initial} onClose={onClose}>
      {(section) => {
        const Component = sections.find((s) => s.id === section)?.Component;
        return Component && <Component onClose={onClose} />;
      }}
    </TabbedDialog>
  );
}

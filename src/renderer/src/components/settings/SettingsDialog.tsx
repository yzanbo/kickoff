import { Bell, Bot, Gauge, Palette, PlugZap, Puzzle, Smartphone } from "lucide-react";
import { useTheme, type Theme } from "../../theme";
import { BrowserExtensions } from "../BrowserExtensions";
import { Segmented } from "../Segmented";
import { TabbedDialog, type DialogSection } from "../TabbedDialog";
import { UsagePanel } from "../UsagePanel";
import { AiDefaultsSettings } from "./AiDefaultsSettings";
import { ConnectionSettings } from "./ConnectionSettings";
import { NotificationSettings } from "./NotificationSettings";

export type SettingsSection = "usage" | "display" | "connection" | "ai" | "notifications" | "browser" | "mobile";

const SETTINGS_SECTIONS: DialogSection<SettingsSection>[] = [
  { key: "usage", label: "使用状況", icon: Gauge },
  { key: "display", label: "表示", icon: Palette },
  { key: "connection", label: "接続", icon: PlugZap },
  { key: "ai", label: "AI の既定", icon: Bot },
  { key: "notifications", label: "通知", icon: Bell },
  { key: "browser", label: "ブラウザの拡張機能", icon: Puzzle },
  { key: "mobile", label: "スマホ連携", icon: Smartphone },
];

/** アプリの設定（左下の歯車・⌘, から開く。プロジェクトの編集と同じ形のダイアログ） */
export function SettingsDialog({ initial, onClose }: { initial?: SettingsSection; onClose: () => void }) {
  return (
    <TabbedDialog title="設定" sections={SETTINGS_SECTIONS} initial={initial} onClose={onClose}>
      {(section) => (
        <>
          {section === "usage" && <UsageSettings />}
          {section === "display" && <DisplaySettings />}
          {section === "connection" && <ConnectionSettings />}
          {section === "ai" && <AiDefaultsSettings />}
          {section === "notifications" && <NotificationSettings />}
          {section === "browser" && (
            <section className="section">
              <h2>ブラウザの拡張機能</h2>
              <BrowserExtensions />
            </section>
          )}
          {section === "mobile" && (
            <section className="section">
              <h2>スマホ連携</h2>
              <div className="empty">LAN / Tailscale 経由のアクセスと QR ペアリングは M5 で対応します。</div>
            </section>
          )}
        </>
      )}
    </TabbedDialog>
  );
}

/** 使用状況（サービスごと。Claude Code はフッターの使用量と同じもの） */
function UsageSettings() {
  return <UsagePanel />;
}

function DisplaySettings() {
  const [theme, setTheme] = useTheme();
  return (
    <section className="section">
      <h2>表示</h2>
      <Segmented<Theme>
        className="segmented theme-switch"
        label="テーマ"
        value={theme}
        onChange={setTheme}
        options={[
          { value: "dark", label: "ダーク" },
          { value: "light", label: "ライト" },
          { value: "system", label: "システムに合わせる" },
        ]}
      />
    </section>
  );
}

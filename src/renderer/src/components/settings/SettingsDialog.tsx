import { Activity, Archive, Bell, Bot, Gauge, Mic, Palette, PlugZap, Puzzle, Smartphone, SquareTerminal } from "lucide-react";
import { useSharedFlag } from "../../hooks/useStoredState";
import { CHAT_WIDE_KEY, COMPOSER_COMPACT_KEY, STICKY_PROMPT_HIDDEN_KEY } from "../../storageKeys";
import { useTheme, type Theme } from "../../theme";
import { Field } from "../Field";
import { BrowserExtensions } from "../BrowserExtensions";
import { Segmented } from "../Segmented";
import { BOARD_HEADER_LAYOUT_LABELS, useBoardHeaderLayout, type BoardHeaderLayout } from "../board/boardHeaderLayout";
import { PROJECT_TABS_LAYOUT_LABELS, useProjectTabsLayout, type ProjectTabsLayout } from "../project/ProjectTabs";
import { TabbedDialog, type DialogSection } from "../TabbedDialog";
import { UsagePanel } from "../footer/UsagePanel";
import { AiDefaultsSettings } from "./AiDefaultsSettings";
import { ChatSettings } from "./ChatSettings";
import { ConnectionSettings } from "./ConnectionSettings";
import { DiagnosticsSettings } from "./DiagnosticsSettings";
import { NotificationSettings } from "./NotificationSettings";
import { TerminalSettings } from "./TerminalSettings";
import { VoiceSettings } from "./VoiceSettings";

export type SettingsSection = "usage" | "display" | "connection" | "ai" | "chats" | "voice" | "notifications" | "terminal" | "browser" | "mobile" | "diagnostics";

const SETTINGS_SECTIONS: DialogSection<SettingsSection>[] = [
  { key: "usage", label: "使用状況", icon: Gauge },
  { key: "display", label: "表示", icon: Palette },
  { key: "connection", label: "接続", icon: PlugZap },
  { key: "ai", label: "AI の既定", icon: Bot },
  { key: "chats", label: "チャット", icon: Archive },
  { key: "voice", label: "音声入力", icon: Mic },
  { key: "notifications", label: "通知", icon: Bell },
  { key: "terminal", label: "ターミナル", icon: SquareTerminal },
  { key: "browser", label: "ブラウザの拡張機能", icon: Puzzle },
  { key: "mobile", label: "スマホ連携", icon: Smartphone },
  { key: "diagnostics", label: "診断", icon: Activity },
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
          {section === "chats" && <ChatSettings />}
          {section === "voice" && <VoiceSettings />}
          {section === "notifications" && <NotificationSettings />}
          {section === "terminal" && <TerminalSettings />}
          {section === "browser" && (
            <section className="section">
              <h2>ブラウザの拡張機能</h2>
              <BrowserExtensions />
            </section>
          )}
          {section === "diagnostics" && <DiagnosticsSettings onClose={onClose} />}
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
  const [compactComposer, setCompactComposer] = useSharedFlag(COMPOSER_COMPACT_KEY);
  const [wideChat, setWideChat] = useSharedFlag(CHAT_WIDE_KEY);
  const [stickyHidden, setStickyHidden] = useSharedFlag(STICKY_PROMPT_HIDDEN_KEY);
  const [tabsLayout, setTabsLayout] = useProjectTabsLayout();
  const [headerLayout, setHeaderLayout] = useBoardHeaderLayout();
  return (
    <section className="section">
      <h2>表示</h2>
      <div className="form">
        <Field label="テーマ">
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
        </Field>
        <Field label="チャット欄" help="コンパクトにすると、チャット欄の文字・余白・下のボタンを小さくして、縦の幅を抑えます。">
          <Segmented<"normal" | "compact">
            className="segmented theme-switch"
            label="チャット欄の大きさ"
            value={compactComposer ? "compact" : "normal"}
            onChange={(v) => setCompactComposer(v === "compact")}
            options={[
              { value: "normal", label: "標準" },
              { value: "compact", label: "コンパクト" },
            ]}
          />
        </Field>
        <Field label="チャットの文の幅" help="広げると、パネルの大きさはそのままで、発言の流れとチャット欄の幅の上限を外し、パネルいっぱいまで広げます（パネルが狭いときは変わりません）。チャットの見出しの行のボタンでも切り替えられます。">
          <Segmented<"normal" | "wide">
            className="segmented theme-switch"
            label="チャットの文の幅"
            value={wideChat ? "wide" : "normal"}
            onChange={(v) => setWideChat(v === "wide")}
            options={[
              { value: "normal", label: "標準" },
              { value: "wide", label: "広げる" },
            ]}
          />
        </Field>
        <Field label="上に貼り付ける指示" help="上にスクロールして自分の指示が見えなくなったとき、読んでいる返答の元の指示をチャットの上端に貼り付けて出します。">
          <Segmented<"show" | "hide">
            className="segmented theme-switch"
            label="上に貼り付ける指示"
            value={stickyHidden ? "hide" : "show"}
            onChange={(v) => setStickyHidden(v === "hide")}
            options={[
              { value: "show", label: "表示する" },
              { value: "hide", label: "表示しない" },
            ]}
          />
        </Field>
        <Field label="プロジェクトのタブ" help="左に縦並びにすると、ボード・エディタのタブをアイコンだけにして本体の左に並べます。見出しの下の行がなくなるので、ボードやチャット欄の縦の幅が少し広がります。">
          <Segmented<ProjectTabsLayout>
            className="segmented theme-switch"
            label="プロジェクトのタブの置き方"
            value={tabsLayout}
            onChange={setTabsLayout}
            options={[
              { value: "top", label: PROJECT_TABS_LAYOUT_LABELS.top },
              { value: "side", label: PROJECT_TABS_LAYOUT_LABELS.side },
            ]}
          />
        </Field>
        <Field
          label="ボードツールバーの置き方"
          help="ボードの上の、新規・表示・グループの作成・検索などが並ぶ帯の置き方です。常時表示は、右のパネルの上にも横幅いっぱいに通して出し、パネルがボードを覆っても見えます。パネル優先は、ボードでチャットのパネルを開いたとき、パネルを上端まで伸ばし（チャットの縦の幅が広がります）、ツールバーはボードの側だけに出します（パネルがボードを覆うと隠れます）。ツールバーの何もないところの右クリックでも切り替えられます。"
        >
          <Segmented<BoardHeaderLayout>
            className="segmented theme-switch"
            label="ボードツールバーの置き方"
            value={headerLayout}
            onChange={setHeaderLayout}
            options={[
              { value: "top", label: BOARD_HEADER_LAYOUT_LABELS.top },
              { value: "beside", label: BOARD_HEADER_LAYOUT_LABELS.beside },
            ]}
          />
        </Field>
      </div>
    </section>
  );
}

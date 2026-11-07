import { Activity, Bell, Bot, Gauge, MessageSquare, MessageSquareQuote, Mic, Palette, PlugZap, Puzzle, Smartphone, SquareTerminal, StickyNote } from "lucide-react";
import { useSetting } from "@/hooks/useSetting";
import { CHAT_HEADER_ROW_HIDDEN, CHAT_TAB_ROW_HIDDEN, CHAT_WIDE, CHILD_CHAT_OPEN_IN, COMPOSER_COMPACT, MEMO_OPEN_IN, STICKY_PROMPT_HIDDEN, SUBAGENT_OPEN_IN } from "@/lib/storageKeys";
import { useTheme, type Theme } from "@/app/theme";
import { Field } from "@/ui/Field";
import { BrowserExtensions } from "@/features/browser/BrowserExtensions";
import { Segmented } from "@/ui/Segmented";
import { FOOTER_MODE_LABELS, FOOTER_MODES, useFooterMode, type FooterMode } from "@/features/footer/footerMode";
import { CHAT_FONT_SIZE_LABELS, CHAT_FONT_SIZES, useChatFontSize, type ChatFontSize } from "@/features/chat/pane/chatFontSize";
import { PROJECT_TABS_LAYOUT_LABELS, useProjectTabsLayout, type ProjectTabsLayout } from "@/features/project/page/ProjectTabs";
import { CHAT_PLACEMENT_LABELS, useChatPlacement, type ChatPlacement } from "@/features/project/page/chatPlacement";
import { TabbedDialog, type DialogSection } from "@/ui/TabbedDialog";
import { UsagePanel } from "@/features/usage/UsagePanel";
import { SnippetBarField } from "@/features/snippet/SnippetBarField";
import { SnippetSettings } from "@/features/snippet/SnippetSettings";
import { AiDefaultsSettings } from "./AiDefaultsSettings";
import { ChatSettings } from "./ChatSettings";
import { ChildChatCreateField } from "./ChildChatCreateField";
import { HandoffAfterField, HandoffViaField } from "./HandoffFields";
import { ConnectionSettings } from "./ConnectionSettings";
import { DiagnosticsSettings } from "./DiagnosticsSettings";
import { MemoSettings } from "./MemoSettings";
import { NotificationSettings } from "./NotificationSettings";
import { TerminalSettings } from "./TerminalSettings";
import { VoiceSettings } from "./VoiceSettings";

export type SettingsSection = "usage" | "display" | "connection" | "ai" | "chats" | "snippets" | "memos" | "voice" | "notifications" | "terminal" | "browser" | "mobile" | "diagnostics";

const SETTINGS_SECTIONS: DialogSection<SettingsSection>[] = [
  { key: "usage", label: "使用状況", icon: Gauge },
  { key: "display", label: "表示", icon: Palette },
  { key: "connection", label: "接続", icon: PlugZap },
  { key: "ai", label: "AI の既定", icon: Bot },
  { key: "chats", label: "チャット", icon: MessageSquare },
  { key: "snippets", label: "定型文", icon: MessageSquareQuote },
  { key: "memos", label: "メモ", icon: StickyNote },
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
          {section === "snippets" && <SnippetSettings />}
          {section === "memos" && <MemoSettings />}
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
  const [compactComposer, setCompactComposer] = useSetting(COMPOSER_COMPACT);
  const [wideChat, setWideChat] = useSetting(CHAT_WIDE);
  const [fontSize, setFontSize] = useChatFontSize();
  const [stickyHidden, setStickyHidden] = useSetting(STICKY_PROMPT_HIDDEN);
  const [headerHidden, setHeaderHidden] = useSetting(CHAT_HEADER_ROW_HIDDEN);
  const [tabRowHidden, setTabRowHidden] = useSetting(CHAT_TAB_ROW_HIDDEN);
  const [subagentOpenIn, setSubagentOpenIn] = useSetting(SUBAGENT_OPEN_IN);
  const [childChatOpenIn, setChildChatOpenIn] = useSetting(CHILD_CHAT_OPEN_IN);
  const [memoOpenIn, setMemoOpenIn] = useSetting(MEMO_OPEN_IN);
  const [tabsLayout, setTabsLayout] = useProjectTabsLayout();
  const [chatPlacement, setChatPlacement] = useChatPlacement();
  const [footerMode, setFooterMode] = useFooterMode();
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
        <Field label="会話の文字の大きさ" help="会話（自分の発言・AI の返答・ツール・サブエージェントのカード・動き）の文字だけを大きく・小さくします。見出し・入力欄・メニューの文字はそのままです。チャットの見出しの行のボタンと、タブの列の「表示」でも切り替えられます。">
          <Segmented<ChatFontSize>
            className="segmented theme-switch"
            label="会話の文字の大きさ"
            value={fontSize}
            onChange={setFontSize}
            options={CHAT_FONT_SIZES.map((s) => ({ value: s, label: CHAT_FONT_SIZE_LABELS[s] }))}
          />
        </Field>
        <Field label="会話の横幅" help="広げると、パネルの大きさはそのままで、発言の流れとチャット欄の幅の上限を外し、パネルいっぱいまで広げます（パネルが狭いときは変わりません）。チャットの見出しの行のボタンでも切り替えられます。">
          <Segmented<"normal" | "wide">
            className="segmented theme-switch"
            label="会話の横幅"
            value={wideChat ? "wide" : "normal"}
            onChange={(v) => setWideChat(v === "wide")}
            options={[
              { value: "normal", label: "標準" },
              { value: "wide", label: "広げる" },
            ]}
          />
        </Field>
        <Field
          label="チャットのタブの列"
          help="チャットのパネルの上の、開いているチャットのタブと、表示・新しいタブ・分けるボタンが並ぶ行です。隠すと、その分チャットの縦の幅が広がります（チャットは左のサイドバー・ボードから切り替えます）。会話の何もないところ・チャットの見出しの右クリックでも切り替えられます。"
        >
          <Segmented<"show" | "hide">
            className="segmented theme-switch"
            label="チャットのタブの列"
            value={tabRowHidden ? "hide" : "show"}
            onChange={(v) => setTabRowHidden(v === "hide")}
            options={[
              { value: "show", label: "表示する" },
              { value: "hide", label: "隠す" },
            ]}
          />
        </Field>
        <Field
          label="チャットの見出し"
          help="チャットの上の、プロジェクト・ブランチのバッジ、会話 / 動きの切り替え、検索欄、ターン数などが並ぶ行です。隠すと、その分チャットの縦の幅が広がります（動きを見ている間とアーカイブ済みのチャットでは出し、検索は ⌘F でチャットの右上に出ます）。⌥⌘T でも切り替えられ、出す項目はタブの列の「表示」→「見出しに出す項目」で 1 つずつ選べます。"
        >
          <Segmented<"show" | "hide">
            className="segmented theme-switch"
            label="チャットの見出し"
            value={headerHidden ? "hide" : "show"}
            onChange={(v) => setHeaderHidden(v === "hide")}
            options={[
              { value: "show", label: "表示する" },
              { value: "hide", label: "隠す" },
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
        <SnippetBarField />
        <Field
          label="サブエージェントを開く場所"
          help="サブエージェントのカードの見出し・動きの行・「サブエージェント N 件」の一覧・裏の作業の一覧を押したときの開き方です。流れの中は、チャットの流れの中でカードを開きます。右の欄は、チャットの画面の右に、チャットと同じような画面で開きます（右の欄の中で上下・左右に分けて並べられ、幅はつまみのドラッグで変えられます）。別ウィンドウは、サブエージェントごとに新しいウィンドウで開きます。ほかの開き方は、一覧の行のボタンやカードのボタンでいつでも選べます。「サブエージェント N 件」の一覧の上でも変えられます。"
        >
          <Segmented<"inline" | "side" | "window">
            className="segmented theme-switch"
            label="サブエージェントを開く場所"
            value={subagentOpenIn}
            onChange={setSubagentOpenIn}
            options={[
              { value: "inline", label: "流れの中" },
              { value: "side", label: "右の欄" },
              { value: "window", label: "別ウィンドウ" },
            ]}
          />
        </Field>
        <OpenPlaceField
          label="子チャットを開く場所"
          help="会話の中・入力欄の上の子チャットの札、サイドバーの子チャットの行、答えの通知を押したときの開き方です。右の欄は、いちばん上の親のチャットの画面の右にタブで開きます（孫・ひ孫も同じ右の欄に並びます）。別ウィンドウは、子チャットごとに新しいウィンドウで開きます。右の欄のタブは、タブの右クリックの「別ウィンドウで開く」でいつでも移せます。"
          value={childChatOpenIn}
          onChange={setChildChatOpenIn}
        />
        <ChildChatCreateField />
        <HandoffViaField />
        <HandoffAfterField />
        <OpenPlaceField
          label="チャットからメモを開く場所"
          help="「メモに追加」のあとの「開く」と、入力欄の上の「メモ」の一覧から開くときの開き方です。右の欄は、チャットの画面の右にタブで開き、会話を見ながら書けます。別ウィンドウは、メモごとに新しいウィンドウで開きます。入力欄の上の「メモ」の一覧の上でも変えられ、一覧の行のボタンで、ここによらずどちらでも開けます。"
          value={memoOpenIn}
          onChange={setMemoOpenIn}
        />
        <Field label="プロジェクトのタブ" help="左に縦並びにすると、ボード・ファイルなどのタブをアイコンだけにして本体の左に並べます。見出しの下の行がなくなるので、ボードやチャット欄の縦の幅が少し広がります。">
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
          label="チャットを開く場所"
          help="チャットタブで開くと、ボードと分けた「チャット」タブにチャットを横幅いっぱいに出し、ボードのカードを押すとそのタブへ移ります。ボードの右で開くと、ボードを見ながら右のパネルでチャットを開きます。どちらも同じタブなので、切り替えても開いているチャットはそのままです。"
        >
          <Segmented<ChatPlacement>
            className="segmented theme-switch"
            label="チャットを開く場所"
            value={chatPlacement}
            onChange={setChatPlacement}
            options={[
              { value: "separate", label: CHAT_PLACEMENT_LABELS.separate },
              { value: "together", label: CHAT_PLACEMENT_LABELS.together },
            ]}
          />
        </Field>
        <Field
          label="下の帯"
          help="画面のいちばん下の、設定・接続・ブランチ・使用状況が並ぶ帯です。「寄せたときだけ表示」は、マウスを画面の下端に寄せると画面の上に重ねて出し、ふだんは縦の幅を取りません。非表示にしても、設定は ⌘, で開けます。帯の右クリックでも切り替えられます。"
        >
          <Segmented<FooterMode>
            className="segmented theme-switch"
            label="下の帯の出し方"
            value={footerMode}
            onChange={setFooterMode}
            options={FOOTER_MODES.map((m) => ({ value: m, label: FOOTER_MODE_LABELS[m] }))}
          />
        </Field>
      </div>
    </section>
  );
}

/** 右の欄か別ウィンドウかを選ぶ欄（子チャット・メモを開く場所） */
function OpenPlaceField({ label, help, value, onChange }: { label: string; help: string; value: "side" | "window"; onChange: (v: "side" | "window") => void }) {
  return (
    <Field label={label} help={help}>
      <Segmented<"side" | "window">
        className="segmented theme-switch"
        label={label}
        value={value}
        onChange={onChange}
        options={[
          { value: "side", label: "右の欄" },
          { value: "window", label: "別ウィンドウ" },
        ]}
      />
    </Field>
  );
}

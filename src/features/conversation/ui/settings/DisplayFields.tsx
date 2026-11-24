// 会話が設定の「表示」に出す欄: 文字の大きさ・横幅・見出し・見出しのバッジ・上に貼り付ける指示
import { useSetting } from "@/foundation/ui/hooks/useSetting";
import { useCommandKeys } from "@/foundation/ui/commands";
import { ChoiceField, SwitchField } from "@/foundation/ui/kit/ChoiceField";
import { storage } from "@/features/conversation/ui/storage";
import { CHAT_FONT_SIZE_LABELS, CHAT_FONT_SIZES, useChatFontSize, type ChatFontSize } from "@/features/conversation/ui/display/chatFontSize";

/** 会話の文字の大きさ */
export function ChatFontSizeField() {
  const [fontSize, setFontSize] = useChatFontSize();
  return (
    <ChoiceField<ChatFontSize>
      label="会話の文字の大きさ"
      help="会話（自分の発言・AI の返答・ツール・サブエージェントのカード・動き）の文字だけを大きく・小さくします。見出し・入力欄・メニューの文字はそのままです。チャットの見出しの行のボタンと、タブの列の「表示」でも切り替えられます。"
      value={fontSize}
      onChange={setFontSize}
      options={CHAT_FONT_SIZES.map((s) => ({ value: s, label: CHAT_FONT_SIZE_LABELS[s] }))}
    />
  );
}

/** 会話の横幅 */
export function ChatWideField() {
  const [wideChat, setWideChat] = useSetting(storage.settings.wide);
  return (
    <ChoiceField<"normal" | "wide">
      label="会話の横幅"
      help="広げると、パネルの大きさはそのままで、発言の流れとチャット欄の幅の上限を外し、パネルいっぱいまで広げます（パネルが狭いときは変わりません）。チャットの見出しの行のボタンでも切り替えられます。"
      value={wideChat ? "wide" : "normal"}
      onChange={(v) => setWideChat(v === "wide")}
      options={[
        { value: "normal", label: "標準" },
        { value: "wide", label: "広げる" },
      ]}
    />
  );
}

/** チャットの見出しの行を出すか */
export function ChatHeaderRowField() {
  const [headerHidden, setHeaderHidden] = useSetting(storage.settings.headerRowHidden);
  const findKey = useCommandKeys("page.find");
  const toggleKey = useCommandKeys("conversation.toggleHeaderRow");
  return (
    <SwitchField
      label="チャットの見出し"
      help={`チャットの上の、プロジェクト・ブランチのバッジ、会話 / 動きの切り替え、検索欄、ターン数などが並ぶ行です。隠すと、その分チャットの縦の幅が広がります（動きを見ている間とアーカイブ済みのチャットでは出し、検索は ${findKey} でチャットの右上に出ます）。${toggleKey} でも切り替えられ、出す項目はチャットの見出しの右クリックの「チャット画面表示」→「見出しに出す項目」で 1 つずつ選べます。`}
      checked={!headerHidden}
      onChange={(on) => setHeaderHidden(!on)}
      onLabel="表示する"
      offLabel="隠す"
    />
  );
}

/** 見出しのバッジの色 */
export function ChatHeaderBadgeField() {
  const [badgeColors, setBadgeColors] = useSetting(storage.settings.headerBadgeColors);
  return (
    <SwitchField
      label="見出しのバッジ"
      help="チャットの見出しのグループ・作業場所のバッジを、それぞれの色（タブの列のまとまりと同じ色）で表示するかです。色なしにすると、灰色の枠と文字だけになります。見出し・会話の何もないところの右クリックでも切り替えられます。"
      checked={badgeColors}
      onChange={setBadgeColors}
      onLabel="色付きで表示する"
      offLabel="色付きで表示しない"
    />
  );
}

/** 上に貼り付ける指示 */
export function StickyPromptField() {
  const [stickyHidden, setStickyHidden] = useSetting(storage.settings.stickyPromptHidden);
  return (
    <SwitchField
      label="上に貼り付ける指示"
      help="上にスクロールして自分の指示が見えなくなったとき、読んでいる返答の元の指示をチャットの上端に貼り付けて出します。"
      checked={!stickyHidden}
      onChange={(on) => setStickyHidden(!on)}
      onLabel="表示する"
      offLabel="表示しない"
    />
  );
}

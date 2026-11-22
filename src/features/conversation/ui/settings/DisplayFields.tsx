// 会話が設定の「表示」に出す欄: 文字の大きさ・横幅・見出し・見出しのバッジ・上に貼り付ける指示
import { useSetting } from "@/foundation/ui/hooks/useSetting";
import { Field } from "@/foundation/ui/kit/Field";
import { Segmented } from "@/foundation/ui/kit/Segmented";
import { storage } from "@/features/conversation/ui/storage";
import { CHAT_FONT_SIZE_LABELS, CHAT_FONT_SIZES, useChatFontSize, type ChatFontSize } from "@/features/conversation/ui/screen/chatFontSize";

/** 会話の文字の大きさ */
export function ChatFontSizeField() {
  const [fontSize, setFontSize] = useChatFontSize();
  return (
    <Field as="div" label="会話の文字の大きさ" help="会話（自分の発言・AI の返答・ツール・サブエージェントのカード・動き）の文字だけを大きく・小さくします。見出し・入力欄・メニューの文字はそのままです。チャットの見出しの行のボタンと、タブの列の「表示」でも切り替えられます。">
      <Segmented<ChatFontSize>
        label="会話の文字の大きさ"
        value={fontSize}
        onChange={setFontSize}
        options={CHAT_FONT_SIZES.map((s) => ({ value: s, label: CHAT_FONT_SIZE_LABELS[s] }))}
      />
    </Field>
  );
}

/** 会話の横幅 */
export function ChatWideField() {
  const [wideChat, setWideChat] = useSetting(storage.settings.wide);
  return (
    <Field as="div" label="会話の横幅" help="広げると、パネルの大きさはそのままで、発言の流れとチャット欄の幅の上限を外し、パネルいっぱいまで広げます（パネルが狭いときは変わりません）。チャットの見出しの行のボタンでも切り替えられます。">
      <Segmented<"normal" | "wide">
        label="会話の横幅"
        value={wideChat ? "wide" : "normal"}
        onChange={(v) => setWideChat(v === "wide")}
        options={[
          { value: "normal", label: "標準" },
          { value: "wide", label: "広げる" },
        ]}
      />
    </Field>
  );
}

/** チャットの見出しの行を出すか */
export function ChatHeaderRowField() {
  const [headerHidden, setHeaderHidden] = useSetting(storage.settings.headerRowHidden);
  return (
    <Field as="div"
      label="チャットの見出し"
      help="チャットの上の、プロジェクト・ブランチのバッジ、会話 / 動きの切り替え、検索欄、ターン数などが並ぶ行です。隠すと、その分チャットの縦の幅が広がります（動きを見ている間とアーカイブ済みのチャットでは出し、検索は ⌘F でチャットの右上に出ます）。⌥⌘T でも切り替えられ、出す項目はチャットの見出しの右クリックの「チャット画面表示」→「見出しに出す項目」で 1 つずつ選べます。"
    >
      <Segmented<"show" | "hide">
        label="チャットの見出し"
        value={headerHidden ? "hide" : "show"}
        onChange={(v) => setHeaderHidden(v === "hide")}
        options={[
          { value: "show", label: "表示する" },
          { value: "hide", label: "隠す" },
        ]}
      />
    </Field>
  );
}

/** 見出しのバッジの色 */
export function ChatHeaderBadgeField() {
  const [badgeColors, setBadgeColors] = useSetting(storage.settings.headerBadgeColors);
  return (
    <Field as="div" label="見出しのバッジ" help="チャットの見出しのグループ・作業場所のバッジを、それぞれの色（タブの列のまとまりと同じ色）で表示するかです。色なしにすると、灰色の枠と文字だけになります。見出し・会話の何もないところの右クリックでも切り替えられます。">
      <Segmented<"color" | "plain">
        label="見出しのバッジ"
        value={badgeColors ? "color" : "plain"}
        onChange={(v) => setBadgeColors(v === "color")}
        options={[
          { value: "color", label: "色付きで表示する" },
          { value: "plain", label: "色付きで表示しない" },
        ]}
      />
    </Field>
  );
}

/** 上に貼り付ける指示 */
export function StickyPromptField() {
  const [stickyHidden, setStickyHidden] = useSetting(storage.settings.stickyPromptHidden);
  return (
    <Field as="div" label="上に貼り付ける指示" help="上にスクロールして自分の指示が見えなくなったとき、読んでいる返答の元の指示をチャットの上端に貼り付けて出します。">
      <Segmented<"show" | "hide">
        label="上に貼り付ける指示"
        value={stickyHidden ? "hide" : "show"}
        onChange={(v) => setStickyHidden(v === "hide")}
        options={[
          { value: "show", label: "表示する" },
          { value: "hide", label: "表示しない" },
        ]}
      />
    </Field>
  );
}

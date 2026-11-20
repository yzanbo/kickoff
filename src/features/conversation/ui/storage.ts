// conversation の画面の保存（キーは kickoff:conversation:<名前の kebab>。ほかの機能が読むものは ui/index.ts から出す）
import { choice, defineSettings, family, flag, list, text } from "@/foundation/ui/storage";

export const storage = defineSettings("conversation", {
  /** チャットごとの、手で隠した ToDo の一覧（その一覧の印 todoSignature。一覧が書き換わったらまた出す） */
  todoHidden: family(text(), { ids: true }),
  /** 上に貼り付ける自分の指示を、1 行にたたまず全文で出すか（どのチャットでも同じ） */
  stickyPromptExpanded: flag(),
  /** チャットの見出しの行で隠している項目（chatHeaderItems.ts の CHAT_HEADER_ITEMS。チャットの見出しの右クリックの「チャット画面表示」→「見出しに出す項目」。初めはプロジェクト・会話 / 動きの切り替え・文字の大きさ・ターン数・API 換算を隠す。どのチャットでも同じ） */
  headerHidden: list(["project", "showing", "fontSize", "turns", "cost"]),
  /** 見出しの行の項目の並び（チャットの見出しの右クリックの「チャット画面表示」→「見出しに出す項目」で、まとまりの中をドラッグで並べ替える。chat/pane/chatHeaderItems.ts。空なら初めの並び） */
  headerOrder: list(),
  /** 会話の文字の大きさ（5 段階。chat/pane/chatFontSize.ts。見出しの行のボタン・見出しと会話の右クリックの「チャット画面表示」・設定の「表示」。どのチャットでも同じ。初めは標準） */
  fontSize: choice(["xs", "sm", "md", "lg", "xl"], "md"),
  /** AI からの質問が複数あるときの出し方（steps = 1 問ずつ / all = すべて並べる） */
  questionLayout: choice(["steps", "all"], "steps"),
});

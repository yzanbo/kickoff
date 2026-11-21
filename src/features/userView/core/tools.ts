// kickoff_chat の利用者が見ているものを読むツール（get_user_view。order 110）。中身は aiUserView.ts、ここは引数の形と使い方だけ
import { defineAiTool, type AiToolGroup } from "@/foundation/core/aiTools/tool";
import type { Store } from "@/features/chat/core/index";
import { createAiUserViewTools } from "./aiUserView";
import type { UserViewRegistry } from "./registry";

/** 利用者が見ているものを読むツールの使い方（MCP の instructions として AI に渡す） */
const USER_VIEW_INSTRUCTIONS = [
  "get_user_view は、利用者がこの Mac の Kickoff の画面でいま見ているもの（このチャットを開いているウィンドウの、見えているペインごとの前のタブ: チャット・エディタのファイルとカーソル・選んでいる範囲・ノートと選んでいる文・ブラウザの URL・GitHub の issue / PR の番号・DB の接続とテーブルなど。右の欄に開いているもの）と、このチャットの最後の発言を送ったときの同じ様子を返す。",
  "利用者が「このファイルのここ」「いま開いてる PR」「選んだところ」のように画面の物を指したときに、自分で確かめるために使う。読むだけなので聞かずに使う。ほかのプロジェクトを見ているときは中身は返らない。分からなければ利用者に聞く。",
];

/** 利用者が見ているものを読むツールの組（聞かずに返す。どのチャットにも出す） */
export function userViewToolGroup(deps: { store: Store; userViews: UserViewRegistry }): AiToolGroup {
  return {
    server: "kickoff_chat",
    order: 110,
    instructions: USER_VIEW_INSTRUCTIONS,
    open: ({ chatId }) => {
      const userView = createAiUserViewTools(deps, chatId);
      return [defineAiTool({ server: "kickoff_chat", name: "get_user_view", description: "利用者がいま Kickoff の画面で見ているもの（ペインごとの前のタブ・選んでいる範囲など）と、最後の発言を送ったときの様子を読む", input: {}, run: () => userView.read() })];
    },
  };
}

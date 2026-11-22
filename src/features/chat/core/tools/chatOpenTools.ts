// kickoff_chat の画面に頼むツールのうち chat が出す組: 家系のチャットの open_chat（41）・開く場所 place の使い方（44。ツールなし）・add_draft（46）。
// 開く組は持ち主ごとに分け、並びの値で前と同じ順に並べる（open_note = notes 40・open_file = files 42・open_diff = git 43・open_sql = database 45）
import type { AiToolDef, AiToolGroup } from "@/foundation/core/aiTools/tool";
import type { BusEvent } from "@shared/foundation/contract";
import type { ChatStoreDeps } from "@/features/chat/core/stores";
import { chatOpenTools } from "./open";

/** kickoff_chat の 1 つの組 */
const openGroup = (order: number, instructions: readonly string[], open: (chatId: number) => AiToolDef[]): AiToolGroup => ({ server: "kickoff_chat", order, instructions, open: ({ chatId }) => open(chatId) });

/** 画面に頼むツールのうち chat の組（聞かずに頼む。画面に頼む口（バス）がなければ出さない） */
export function chatOpenToolGroups(d: { store: Pick<ChatStoreDeps, "chats" | "projects">; publish: ((event: BusEvent) => void) | null }): AiToolGroup[] {
  const { publish } = d;
  if (!publish) return [];
  const family = (chatId: number) => chatOpenTools({ store: d.store, publish }, chatId);
  return [
    openGroup(41, ["open_chat は、このチャットと同じ家系のチャット（list_family_chats の一覧）を Kickoff の画面に開く。子チャット・孫チャットは右の欄か別ウィンドウ、いちばん上の親チャットはチャットのパネルに開く。"], (chatId) => [family(chatId).openChat]),
    openGroup(
      44,
      ["place は side（いちばん上の親チャットの画面の右の欄。子チャットの中からでも親の右の欄に開く）か window（別ウィンドウ）。利用者が「右で」「右の欄で」「サイドで」と言ったら side、「別ウィンドウで」「新しいウィンドウで」と言ったら window。場所を言われなければ省く（ノート・チャットは利用者の設定の開き方、ファイル・差分は右の欄）。"],
      () => [],
    ),
    openGroup(
      46,
      [
        "add_draft は、同じ家系のチャット（list_family_chats の一覧。親チャット・子チャットなど）の入力欄に下書きを入れる。書きかけがあれば、その後ろに足す（消さない）。親チャットに入れると「子チャットから渡した」の印も付く。送るのは利用者。利用者が「親チャットに渡して」「〇〇の入力欄に入れて」と頼んだときに使う。",
        "どれも開く・入れるだけで何も変えないので、聞かずに頼む。頼まれていないのに開かない・入れない。開けたかは返らない（画面に頼むだけ）。",
      ],
      (chatId) => [family(chatId).addDraft],
    ),
  ];
}

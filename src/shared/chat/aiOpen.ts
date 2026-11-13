// チャットの AI がメモ・家系のチャットを開くツール（kickoff_chat の open_memo・open_chat）の、コアと画面で共有する名前と、記録の行に出す文
import { OPEN_PLACE_LABELS, OPEN_PLACES, type OpenPlace } from "@shared/types";

/** メモを開くツールの名前 */
export const AI_OPEN_MEMO_TOOL = "mcp__kickoff_chat__open_memo";

/** 家系のチャットを開くツールの名前 */
export const AI_OPEN_CHAT_TOOL = "mcp__kickoff_chat__open_chat";

/** open_memo の引数（path はメモのフォルダからの相対パスか、メモのフォルダの中の絶対パス。place を省くと画面の設定の開き方） */
export interface OpenMemoInput {
  path: string;
  place?: OpenPlace;
}

/** open_chat の引数（place を省くと画面の設定の開き方。いちばん上の親チャットはチャットのパネルで開くので place は効かない） */
export interface OpenChatInput {
  chat_id: number;
  place?: OpenPlace;
}

/** 引数の place の言葉（なければ null） */
const placeLabel = (place: unknown): string | null => (OPEN_PLACES.includes(place as OpenPlace) ? OPEN_PLACE_LABELS[place as OpenPlace] : null);

/** 記録の行に出す文（「機能の仕様/図.html（別ウィンドウ）」。場所を省いたら場所は付けない） */
export function describeOpenMemo(input: Record<string, unknown>): string {
  const target = typeof input.path === "string" ? input.path : "";
  const place = placeLabel(input.place);
  return place ? `${target}（${place}）` : target;
}

/** 記録の行に出す文（「チャット 12（右の欄）」） */
export function describeOpenChat(input: Record<string, unknown>): string {
  const target = typeof input.chat_id === "number" ? `チャット ${input.chat_id}` : "";
  const place = placeLabel(input.place);
  return place ? `${target}（${place}）` : target;
}

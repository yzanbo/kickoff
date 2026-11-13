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

/** 作業場所のファイルを開くツールの名前 */
export const AI_OPEN_FILE_TOOL = "mcp__kickoff_chat__open_file";

/** コミットしていない変更（差分）を開くツールの名前 */
export const AI_OPEN_DIFF_TOOL = "mcp__kickoff_chat__open_diff";

/** SQL のタブに SQL を入れて開くツールの名前 */
export const AI_OPEN_SQL_TOOL = "mcp__kickoff_chat__open_sql";

/** 家系のチャットの入力欄に下書きを入れるツールの名前 */
export const AI_ADD_DRAFT_TOOL = "mcp__kickoff_chat__add_draft";

/** open_file の引数（path は作業場所からの相対パスか、作業場所の中の絶対パス。line は目立たせる行） */
export interface OpenFileInput {
  path: string;
  line?: number;
  place?: OpenPlace;
}

/** open_diff の引数（path を省くと変更の全体） */
export interface OpenDiffInput {
  path?: string;
  place?: OpenPlace;
}

/** open_sql の引数（connection は接続の名前。AI に見せる接続が 1 つだけなら省ける） */
export interface OpenSqlInput {
  sql: string;
  connection?: string;
}

/** add_draft の引数 */
export interface AddDraftInput {
  chat_id: number;
  text: string;
}

/** 記録の行に出す文（「src/a.ts:12（別ウィンドウ）」） */
export function describeOpenFile(input: Record<string, unknown>): string {
  const target = typeof input.path === "string" ? input.path : "";
  const line = typeof input.line === "number" ? `${target}:${input.line}` : target;
  const place = placeLabel(input.place);
  return place ? `${line}（${place}）` : line;
}

/** 記録の行に出す文（「src/a.ts（右の欄）」。path を省いたら「変更の全体」） */
export function describeOpenDiff(input: Record<string, unknown>): string {
  const target = typeof input.path === "string" && input.path ? input.path : "変更の全体";
  const place = placeLabel(input.place);
  return place ? `${target}（${place}）` : target;
}

/** 記録の行に出す文（接続の名前と SQL の 1 行目） */
export function describeOpenSql(input: Record<string, unknown>): string {
  const sql = typeof input.sql === "string" ? (input.sql.trim().split("\n")[0] ?? "") : "";
  return typeof input.connection === "string" && input.connection ? `${input.connection}: ${sql}` : sql;
}

/** 記録の行に出す文（「チャット 12」） */
export function describeAddDraft(input: Record<string, unknown>): string {
  return typeof input.chat_id === "number" ? `チャット ${input.chat_id}` : "";
}

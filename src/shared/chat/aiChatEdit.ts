// チャットの AI が同じ家系のチャットの名前・固定・グループを変えるツール（kickoff_chat の list_family_chats・update_chat）の、
// コアと画面で共有する名前と、記録の行に出す文

/** 同じ家系のチャットとグループの一覧を返すツールの名前 */
export const AI_LIST_FAMILY_TOOL = "mcp__kickoff_chat__list_family_chats";

/** 同じ家系のチャットの名前・固定・グループを変えるツールの名前 */
export const AI_UPDATE_CHAT_TOOL = "mcp__kickoff_chat__update_chat";

/**
 * update_chat の引数（省いた項目は変えない。group_id は null のときだけグループから外す）。parent_id は子チャットを親から外す:
 * null なら親のないチャット（group_id を一緒に渡せばそのグループへ）、自分の先祖の ID ならその子に上げる
 */
export interface UpdateChatInput {
  chat_id: number;
  title?: string;
  pinned?: boolean;
  group_id?: number | null;
  parent_id?: number | null;
}

/** 引数から作る、変えたことの言葉（「名前を『…』に変えた」「固定した」「グループから外した」）。省いた項目は入れない */
export function updateChatChanges(input: Record<string, unknown>): string[] {
  const changes: string[] = [];
  if (typeof input.title === "string") changes.push(`名前を『${input.title.trim()}』に変えた`);
  if (typeof input.pinned === "boolean") changes.push(input.pinned ? "固定した" : "固定を外した");
  if (input.parent_id === null) changes.push("親から外した");
  else if (typeof input.parent_id === "number") changes.push(`チャット ${input.parent_id} の子にした`);
  if (input.group_id === null) changes.push("グループから外した");
  else if (typeof input.group_id === "number") changes.push(`グループ（ID ${input.group_id}）に入れた`);
  return changes;
}

/** 記録の行に出す文（「名前を『…』に変えた・固定した（チャット 12）」。変える項目がなければ「チャット 12」だけ） */
export function describeUpdateChat(input: Record<string, unknown>): string {
  const target = typeof input.chat_id === "number" ? `チャット ${input.chat_id}` : null;
  const changes = updateChatChanges(input).join("・");
  if (!changes) return target ?? "";
  return target ? `${changes}（${target}）` : changes;
}

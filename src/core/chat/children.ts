// 子チャット: チャットの寄り道の質問を、親に紐づいた別のチャットで聞く（親の作業を止めずに並行して動く。何往復でも会話でき、
// 結果は自分で選んで親に渡す）。親の会話を引き継ぐなら、親のいちばん新しい「最後まで終わった作業」の時点から会話を写して始める
import type { Attachment, Chat, ChatOptionsPatch, ProviderId } from "@shared/types";
import type { Store } from "../db/store.js";
import { asInvalid } from "../http/errors.js";
import type { AgentProvider } from "../providers/types.js";
import type { Runner } from "./runner.js";
import { resumePointBefore } from "./sessionPoints.js";
import { workdirOf } from "./workdir.js";

export interface ChildChatInput {
  /** 聞くこと */
  text: string;
  /** 親の会話から選んだ文（引用として質問の前に置く） */
  quote: string | null;
  /** 親の会話を引き継ぐか */
  inherit: boolean;
  /** 親の会話のどの記録から聞いたか */
  eventId: number | null;
  options?: ChatOptionsPatch;
  /** 添付（チャット欄から子チャットに送ったとき） */
  attachments?: Attachment[];
}

/** 選んだ文を Markdown の引用にする */
function quoteBlock(quote: string): string {
  return quote
    .trim()
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n");
}

/**
 * 名前を付けるもとの文: 頭の引用（`> ` の行）と空行を除いた残り（画面は選んだ文を引用として文に入れて送るので、名前が引用にならないように）。
 * 引用しかなければ文のまま
 */
function titleSourceOf(text: string): string {
  const lines = text.split("\n");
  const start = lines.findIndex((line) => !/^\s*(>.*)?$/.test(line));
  return start < 0 ? text : lines.slice(start).join("\n");
}

/**
 * 子チャットを作って動かす（作業場所は親と同じ。グループには入れない）。親の会話を引き継ぐときは、親の最後まで終わった作業の時点から
 * 会話を写す（親が作業中でも、1 つ前の終わった時点から始められる）。引き継げない（まだ終わった作業がない・分岐できないプロバイダー）
 * ときは、選んだ文と質問だけで始め、そのことをお知らせに残す
 */
export async function startChildChat(
  deps: { store: Store; runner: Runner; providers: Record<ProviderId, AgentProvider> },
  parent: Chat,
  input: ChildChatInput,
): Promise<Chat> {
  const { store, runner, providers } = deps;
  const project = store.projects.get(parent.project_id);
  const parentName = parent.title || "（名前なし）";
  let sessionId: string | undefined;
  let notice = input.inherit ? `親のチャット「${parentName}」の会話を引き継いで始めました` : `親のチャット「${parentName}」から、会話を引き継がずに始めました`;
  if (input.inherit && project) {
    // 親の最後まで終わった作業の終わり（そのあとでコンテキストを消去していれば、引き継げる会話はない）
    const point = resumePointBefore(store.events.list(parent.id));
    const provider = providers[parent.provider];
    if (point?.session_id && point.message_id && provider.fork) {
      sessionId = await provider.fork(point.session_id, point.message_id, workdirOf(parent, project)).catch(asInvalid);
    } else {
      notice = `親のチャット「${parentName}」には引き継げる会話がまだないので、選んだ文だけで始めました`;
    }
  }
  const prompt = input.quote?.trim() ? `${quoteBlock(input.quote)}\n\n${input.text}` : input.text;
  return runner.start({
    projectId: parent.project_id,
    prompt,
    titleText: titleSourceOf(input.text),
    options: input.options,
    attachments: input.attachments,
    worktreePath: parent.worktree_path ?? undefined,
    parentChatId: parent.id,
    parentEventId: input.eventId ?? undefined,
    sessionId,
    notice,
  });
}

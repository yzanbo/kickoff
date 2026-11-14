// 子チャット: チャットの寄り道の質問を、親に紐づいた別のチャットで聞く（親の作業を止めずに並行して動く。何往復でも会話でき、
// 結果は自分で選んで親に渡す）。親の会話を引き継ぐなら、親のいちばん新しい「最後まで終わった作業」の時点から会話を写して始める。
// 聞くことがなければ（文も添付もない）、会話を写した子チャットを作るだけで動かさない（開いてから書いて送る）
import type { Attachment, Chat, ChatOptionsPatch, ProviderId } from "@shared/types";
import { resolveChatOptions } from "@shared/chat/chatOptions";
import type { Store } from "../db/store.js";
import { asInvalid, Invalid } from "../http/errors.js";
import { CHILD_FORK_KEEP, type AgentProvider } from "../providers/types.js";
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
  /** 名前（AI が作るときに付けたもの。なければ文から付ける） */
  title?: string;
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
  // 親の会話を写す手順（写すのは親の記録の大きさに比例して時間がかかる。会話が長いと数十秒）
  let fork: (() => Promise<string>) | undefined;
  let notice = input.inherit ? `親のチャット「${parentName}」の会話を引き継いで始めました` : `親のチャット「${parentName}」から、会話を引き継がずに始めました`;
  if (input.inherit && project) {
    // 親の最後まで終わった作業の終わり（そのあとでコンテキストを消去していれば、引き継げる会話はない）
    const point = resumePointBefore(store.events.list(parent.id));
    const provider = providers[parent.provider];
    const { session_id: from, message_id: at } = point ?? {};
    if (from && at && provider.fork) {
      const forkSession = provider.fork.bind(provider);
      const workdir = workdirOf(parent, project);
      // 子チャットは最新の区切り（最後の圧縮の要約とそのあと）だけを写す（メモの仕様書「ファイル削除」の Q18）
      fork = () => forkSession(from, at, workdir, { keep: CHILD_FORK_KEEP });
    } else {
      notice = `親のチャット「${parentName}」には引き継げる会話がまだないので、選択部分だけで始めました`;
    }
  }
  // 聞くことがない: 会話を写した子チャットを作るだけ（動かさない。名前は最初に送った文から付ける runner.send）
  if (!input.text.trim() && !input.attachments?.length) {
    if (!fork) throw new Invalid(input.inherit ? `親のチャット「${parentName}」には引き継げる会話がまだありません。聞きたいことを書いてください` : "メッセージか添付ファイルが必要です");
    const sessionId = await fork().catch(asInvalid);
    return openChildChat(store, parent, { sessionId, notice, eventId: input.eventId, options: input.options });
  }
  const prompt = input.quote?.trim() ? `${quoteBlock(input.quote)}\n\n${input.text}` : input.text;
  return runner.start({
    projectId: parent.project_id,
    prompt,
    ...(input.title ? { title: input.title } : {}),
    titleText: titleSourceOf(input.text),
    options: input.options,
    attachments: input.attachments,
    worktreePath: parent.worktree_path ?? undefined,
    parentChatId: parent.id,
    parentEventId: input.eventId ?? undefined,
    // 会話を写すのは作ったあとで待たずに（写し終えるまで作業中として見せ、終わったら送る Runner.start）
    prepareSession: fork,
    notice,
  });
}

/** 聞かずに開く子チャット: 親の会話を写したセッションを持たせて作り、引き継いだお知らせだけを残す（作業は動かさない。名前は空 = 最初に送った文から付ける） */
function openChildChat(store: Store, parent: Chat, init: { sessionId: string; notice: string; eventId: number | null; options?: ChatOptionsPatch }): Chat {
  const project = store.projects.get(parent.project_id)!;
  const created = store.chats.create({
    project_id: parent.project_id,
    provider: project.provider,
    title: "",
    status: "completed",
    ...resolveChatOptions(store.settings.get(), project.chat_defaults, init.options),
    group_id: null,
    worktree_path: parent.worktree_path,
    parent_chat_id: parent.id,
    parent_event_id: init.eventId,
    memo_path: null,
  });
  store.events.add(created.id, { type: "notice", message: init.notice });
  return store.chats.update(created.id, { session_id: init.sessionId, branch: parent.branch, context_window: parent.context_window });
}

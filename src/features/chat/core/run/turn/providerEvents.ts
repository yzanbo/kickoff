// プロバイダーからの知らせ: 途中経過は配るだけ、移り変わりに関わるもの（足す口・圧縮中・自動の圧縮の前の指示・圧縮の記録）は殻へ出来事で渡し、
// 表示だけの値は run に書き（殻が配る）、記録は残し、承認依頼は回答を待つ
import { chosenPreviews } from "@shared/chat/questionPreviews";
import { isUnreadEvent } from "@shared/chat/state";
import { systemClock } from "@/foundation/core/clock";
import { SPENDING_NOTICES } from "@shared/ai/overage";
import type { Question } from "@shared/chat/approvalTypes";
import type { ChatEvent } from "@shared/chat/chatEvent";
import { DRAWING_TOOLS } from "@shared/chat/indexedTools";
import type { CompactTrigger } from "@shared/ai/turnEvents";
import type { Chat } from "@shared/chat/types";
import type { ExecutionDeps, ProviderCallbacks } from "@/features/chat/core/turn";
import { recordEvent } from "@/features/chat/core/run/record";
import type { ChatRun } from "@/features/chat/core/run/chatRun";

/**
 * プロバイダーからの知らせ: 途中経過は配るだけ、作業中の様子は run に書き（殻が画面に配る）、イベントは記録、承認依頼は回答を待つ（待つ間は回答待ち）
 */
export function callbacksFor(
  { store, approvals, bus, usage, clock }: ExecutionDeps,
  runtime: ChatRun,
  chat: Chat,
  signal: AbortSignal,
  compact: boolean,
  compactTrigger: CompactTrigger,
  { pre: preCompactText, post: postCompactText }: { pre: string | null; post: string | null },
  /** AI が出した記録を足したとき（登録した contributor の onRecord） */
  onRecord: (event: ChatEvent) => void = () => {},
): ProviderCallbacks {
  const chatId = chat.id;
  const projectId = chat.project_id;
  return {
    subagentProgress: (subagent) => {
      bus?.publish({ type: "chat_subagent", project_id: projectId, chat_id: chatId, subagent });
    },
    commandOutput: (output) => {
      bus?.publish({ type: "chat_command_output", project_id: projectId, chat_id: chatId, output });
    },
    retry: (retry) => runtime.setDisplay({ retry }),
    // 手で圧縮する実行（圧縮のボタン）には発言を足さない（足すと、その返答が圧縮の実行の中に入り、未読・作業の終わりが残らない。「いま」は実行の終わりで送る）
    control: (control) => {
      if (!compact) runtime.setControl(control);
    },
    background: (background) => runtime.setDisplay({ background }),
    // 上限を超えたあとの支払い（Claude の追加の使用枠・Codex のクレジット）で動き始めたら、どの作業から引かれたかが分かるようお知らせに残す（下の帯の札も赤くなる）
    spending: (note) => {
      const message = SPENDING_NOTICES[chat.provider];
      if (usage?.noteSpending(chat.provider, note) && message) recordEvent(store, runtime, { type: "notice", message });
    },
    // 図のツールの中身は長いので、書き終えるまで画面に「図を描いています…」を出す（どれかを書いている間）
    toolInputStreaming: drawingTracker((drawingVisual) => runtime.setDisplay({ drawingVisual })),
    // 圧縮を始めた時刻は、終わるまで変えない（続けて始まったと知らされても、最初の時刻のまま。Claude Code は待っている間も 30 秒ごとに知らせ直す）
    // 圧縮が始まったら、この作業が終わるまで「いま」を預かる（圧縮後指示のやり取りに混ぜない。作業の終わりで外れる）
    compacting: (active) => runtime.dispatch({ type: "compacting", active, at: (clock ?? systemClock).iso(), trigger: compactTrigger }),
    // 圧縮の直後のコンテキストの大きさは、作業の終わりを待たずにチャットへ書く（入力欄のメーターがすぐ縮む。作業の終わりには最後の応答の大きさで書き直す）
    context: (tokens) => {
      if (store.chats.get(chatId)?.context_tokens !== tokens) store.chats.update(chatId, { context_tokens: tokens });
    },
    // 失敗は、手で圧縮したときだけお知らせに残す（自動の圧縮の失敗は too_few_groups なども含み Claude Code も知らせない。本当にあふれたら作業が失敗として残る）
    compactFailed: (reason) => {
      if (compactTrigger === "manual") recordEvent(store, runtime, { type: "notice", message: `会話の圧縮に失敗しました${reason ? `（${reason}）` : ""}` });
    },
    stream: (text) => {
      bus?.publish({ type: "chat_delta", project_id: projectId, chat_id: chatId, text });
    },
    // 自動の圧縮の前に圧縮前指示を足した: 札付きの自分の発言として残す（AI には前置きを付けて送っている）
    preCompactSent: (uuid) => {
      if (!preCompactText) return;
      // 圧縮が終わるまで、「いま」は預かる（圧縮前指示の作業に混ぜない）。圧縮か消去まで、もう足さない（記録から導く preCompactSent）
      runtime.dispatch({ type: "pre_compact_injected" });
      recordEvent(store, runtime, { type: "user", text: preCompactText, pre_compact: true, message_uuid: uuid });
    },
    // 合図のあと裏の作業を待って止まっていたので、Kickoff が発言を足して圧縮を走らせた: 何が起きたかをお知らせに残す（足した文は AI 向けなので発言にしない）
    preCompactNudged: () => {
      recordEvent(store, runtime, { type: "notice", message: "圧縮前指示が済んだあと、AI が裏の作業の終わりを待って止まっていたので、会話の圧縮を始めるよう Kickoff が促しました" });
    },
    emit: (event) => {
      if (event.type === "init" && event.session_id !== store.chats.get(chatId)?.session_id) {
        store.chats.update(chatId, { session_id: event.session_id });
      }
      // 手で圧縮する実行の圧縮は、頼んだきっかけで残す（自動の圧縮の前の指示のあとに Runner が続けた圧縮は auto）
      const saved = recordEvent(store, runtime, event.type === "compact" && compact ? { ...event, trigger: compactTrigger } : event);
      // 圧縮した（記録を残してから）: 圧縮後指示があれば、預かった指示の先頭に置く（step の compacted）
      if (event.type === "compact") runtime.dispatch({ type: "compacted", post: postCompactText, compactRun: compact });
      onRecord(saved);
      // 作業中でも、AI の文章の返答が届いたら未読にする（一番下まで見ると既読。要約の途中経過では付けない）
      if (!compact && isUnreadEvent(saved) && !store.chats.get(chatId)?.unread) store.chats.setUnread(chatId, true);
    },
    requestApproval: async (req, approvalSignal) => {
      const { approval, decision } = approvals.request({ chatId, projectId }, req, approvalSignal);
      recordEvent(store, runtime, {
        type: "approval",
        approval_id: approval.id,
        kind: approval.kind,
        tool_name: approval.tool_name,
        title: approval.title,
      });
      const answer = await decision;
      // AI からの質問に答えたときは、何と答えたか（選んだままの回答と添付・選んだ選択肢の図）も残す（画面は「質問への回答」の吹き出しで出す）
      const previews = answer.action === "answer" ? chosenPreviews((approval.input.questions as Question[] | undefined) ?? [], answer.plain ?? answer.answers) : undefined;
      recordEvent(
        store,
        runtime,
        answer.action === "answer"
          ? {
              type: "approval_resolved",
              approval_id: approval.id,
              kind: approval.kind,
              action: "answer",
              answers: answer.plain ?? answer.answers,
              ...(answer.attachments ? { attachments: answer.attachments } : {}),
              ...(previews ? { previews } : {}),
            }
          : { type: "approval_resolved", approval_id: approval.id, kind: approval.kind, action: answer.action },
      );
      return answer;
    },
  };
}

/** 図のツール（DRAWING_TOOLS）の入力を書いている数を数え、書き始めたら true、全部書き終えたら false を渡す（ほかのツールは見ない） */
export function drawingTracker(set: (drawing: boolean) => void): (toolName: string, active: boolean) => void {
  let writing = 0;
  return (toolName, active) => {
    if (!DRAWING_TOOLS.has(toolName)) return;
    writing = Math.max(0, writing + (active ? 1 : -1));
    if (active && writing === 1) set(true);
    else if (!active && writing === 0) set(false);
  };
}

// 殻の窓口のうち、起動したときの再開の確かめ（前回の終了で作業の途中で止まった・自動で送るまま送信待ちが残ったチャットに、続けるかを聞く）
import { Invalid } from "@/foundation/core/errors";
import { resumeMomentsOf, stoppedSubagentsOf } from "@/features/chat/core/log/restartMoments";
import type { RestartResume, RestartResumeAction } from "@shared/chat/chatLive";
import type { RunShell } from "./shell";

/** 起動したときの再開の確かめで、止まったところを探す記録の数（新しいほうから） */
const RESUME_EVENTS = 300;

export function restartResumes(shell: RunShell) {
  const { store } = shell.deps;

  /** 前回の終了で作業の途中で止まったサブエージェント（最後の自分の指示より後の記録から） */
  const stoppedSubagents = (chatId: number) => {
    const since = store.events.latestUserId(chatId) ?? 0;
    return stoppedSubagentsOf(store.events.after(chatId, since), since);
  };

  /** 起動したときの再開の確かめに答えた・聞くことがなくなった: 印を外す（次の起動でも聞かない） */
  const settleResume = (chatId: number) => {
    const run = shell.runs.peek(chatId);
    if (!run) return;
    const interrupted = run.run.gates.restart?.interrupted ?? false;
    shell.dispatch(chatId, { type: "gates", patch: { restart: null } });
    if (interrupted) store.chats.setResumePending([chatId], false);
  };

  return {
    /**
     * 起動したとき: 前回の終了で作業の途中で止まったチャット（interrupted）と、自動で送るまま送信待ちが残ったチャット（先頭の上に線がなく、作業していない）は、
     * 起動しただけでは続けず・送らず、利用者に聞く門を立てる
     */
    askOnBoot(interrupted: number[]) {
      const stopped = new Set(interrupted);
      const queued = new Set(
        store.outbox
          .list()
          .map((saved) => saved.chatId)
          .filter((chatId) => {
            const { outbox } = shell.runs.get(chatId).run;
            return outbox.later.length > 0 && !outbox.paused && outbox.stops[0] !== 0 && !shell.isBusy(chatId);
          }),
      );
      for (const chatId of new Set([...stopped, ...queued])) shell.dispatch(chatId, { type: "gates", patch: { restart: { interrupted: stopped.has(chatId), queued: queued.has(chatId) } } });
    },

    /**
     * 起動したときの再開の確かめ: 前回の終了で、作業の途中で止まった・自動で送るまま送信待ちが残ったチャット（答えるまで続けない・送らない）。
     * 選ぶ前に中身を見られるよう、送信待ちのすべてと、止まったところ・止まったサブエージェントを添える。
     * 聞くことがなくなったもの（送信待ちが空になった・アーカイブした・消した）は外す
     */
    restartResumes(): RestartResume[] {
      const out: RestartResume[] = [];
      for (const run of shell.runs.all()) {
        const { chatId } = run;
        const resume = run.run.gates.restart;
        if (!resume) continue;
        const chat = store.chats.get(chatId);
        if (!chat || chat.archived_at !== null) {
          settleResume(chatId);
          continue;
        }
        const { later: messages, stops } = run.outbox;
        const queued = resume.queued && messages.length > 0;
        if (!queued && !resume.interrupted) {
          shell.dispatch(chatId, { type: "gates", patch: { restart: null } });
          continue;
        }
        if (queued !== resume.queued) shell.dispatch(chatId, { type: "gates", patch: { restart: { interrupted: resume.interrupted, queued } } });
        out.push({ chat_id: chatId, project_id: chat.project_id, title: chat.title, interrupted: resume.interrupted, queued, messages: queued ? messages : [], stops: queued ? stops : [], ...resumeMomentsOf(store.events.recent(chatId, RESUME_EVENTS)), subagents: resume.interrupted ? stoppedSubagents(chatId) : [] });
      }
      return out.sort((a, b) => a.chat_id - b.chat_id);
    },

    /**
     * 起動したときの再開の確かめに答える（チャットごと。答えなかったチャットは待ったまま = 「あとで」）。
     * 送る: 送信待ちだけを送る（自動で送るのまま先頭を送る）/ 続ける: 中断した作業を続けるよう頼み（止まったサブエージェントの再開も）、
     * 送信待ちはその作業が終わってから送る（中断していなければ、送ると同じ）/ 止めておく: 送信待ちは止めています、作業は止めたまま。
     * 送信待ちのないチャットに「送る」は 400（どれも変えない）。自分で送って作業中なら、続けるは頼まず、送信待ちはその作業の終わりで送る。
     * 確かめを待っていないチャットは飛ばす
     */
    async resolveRestartResumes(decisions: { chatId: number; action: RestartResumeAction }[]): Promise<void> {
      for (const { chatId, action } of decisions) {
        if (action === "send" && shell.runs.peek(chatId)?.run.gates.restart?.queued === false) throw new Invalid("送信待ちのないチャットには「送る」を選べません");
      }
      for (const { chatId, action } of decisions) {
        const resume = shell.runs.get(chatId).run.gates.restart;
        if (!resume) continue;
        // 続けるなら、止まったサブエージェントは答えを消す前に探す
        const agents = action === "continue" && resume.interrupted ? stoppedSubagents(chatId).map((a) => ({ agentId: a.agent_id, description: a.description })) : [];
        await Promise.all(shell.dispatch(chatId, { type: "answer_restart", action, agents }).started);
      }
    },
  };
}

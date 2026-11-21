import { randomUUID } from "node:crypto";
import type { ExecutionDeps, TurnRequest } from "./turn";
import { RunnerShell } from "./runnerShell";
import type { ChatRuntime } from "./runtime";
import { ChatRuntimes } from "./runtimes";
import { holdOf, isBusy as busyState, queuePaused } from "@/features/chat/core/run/machine/state";
import type { Effect } from "@/features/chat/core/run/machine/types";
import { recordEvent } from "@/features/chat/core/run/record";
import { ChatRecovery } from "@/features/chat/core/recovery/recovery";
import { createChat, followupPrompt, type StartChatInput } from "./input";
import { startChildChat } from "@/features/childChats/core/children";
import { moveChatWorkplace, type WorkplaceMoveSteps, type WorkplaceMoveInput } from "@/features/workplaceMove/core/workplaceMove";
import { cancelledNote, notMovedNotice, runReservedMove, WorkplaceReservations, type WorkplaceMovePlan } from "@/features/workplaceMove/core/workplaceReservation";
import type { ChatRemover } from "@/features/chat/core/tools/aiChatRemove";
import type { ChatLive, RestartResume, RestartResumeAction } from "@shared/chat/chatLive";
import type { Chat } from "@shared/chat/types";
import { resumeMomentsOf, stoppedSubagentsOf } from "@/features/chat/core/log/restartMoments";
import type { UsageMonitor } from "@/features/ai/core/index";
import { Conflict, Invalid, NotFound } from "@/foundation/core/errors";
import { errorMessage } from "@shared/foundation/errors";
import { preCompactPromptOf } from "@/features/compact/core/preCompact";
import { prepareAndCommitProviderSwitch, retryProviderHandoffPreparation } from "@/features/providerSwitch/core/providerSwitch";
import { handoffBlocksSwitch } from "@/features/chat/core/db/chatProviderHandoffs";
import type { ProviderId } from "@shared/settings/types";
import { providerCan } from "@shared/ai/providers";

/**
 * エージェントの実行を管理する殻。送った指示はすぐ動かす（同時に動かす数は決めない）。1 つのチャットは 1 つの会話で、追加のメッセージを送ると同じセッションを続きから再開する。
 * 操作も知らせも出来事（RunEvent）にして dispatch に渡し、次の状態と命令は純粋な step（run/machine/step.ts）が決める。ここは命令を実行するだけ
 * （作業を動かす・いまの作業に足す・記録・時計・再開の段取り）。チャットごとの状態は runtime.ts の ChatRuntime、1 回の実行の中身は turn.ts、
 * 通信の切断・使用枠の上限で止まったときの再開の段取り（待つ・聞く・再開する）は recovery/
 */
/** 起動したときの再開の確かめで、止まったところを探す記録の数（新しいほうから） */
const RESUME_EVENTS = 300;

export class Runner extends RunnerShell {
  protected readonly runtimes: ChatRuntimes;
  /** 通信の切断・使用枠の上限で止まったあとの再開の段取り */
  protected readonly recovery: ChatRecovery;
  /** 1 回の実行に渡すもの（AI が自分の子チャットを作るツールのために、子チャットの作り方を足す） */
  protected readonly turnDeps: ExecutionDeps;
  /** AI が作業場所を移す予約（作業が最後まで終わったら移す） */
  private readonly workplaceMoves: WorkplaceReservations;

  constructor(
    protected readonly deps: ExecutionDeps & {
      usage: UsageMonitor;
      /** つながったかの確かめ方と間隔（テストで差し替える） */
      reconnect?: { check?: (url: string) => Promise<boolean>; intervalMs?: number };
      /** 使用枠が戻ったかを確かめる時計と間隔（テストで差し替える） */
      usageLimit?: { now?: () => number; checkMs?: number };
      /** 書き直している印の持ち時間（テストで差し替える） */
      editHoldTtlMs?: number;
      /** 前回の終了で作業の途中で止まったチャット（store.chats.recoverInterrupted が返す印のあるもの。起動したときの再開の確かめで「続ける」を選べる） */
      interrupted?: number[];
    },
  ) {
    super();
    this.turnDeps = {
      ...deps,
      isBusy: (chatId) => this.isBusy(chatId),
      startChat: async (parent, input) => {
        const chat = await startChildChat({ store: deps.store, runner: this, providers: deps.providers }, parent, input);
        // 親の会話を写し終えた・いま写している（写すのは作ったあとで待たずに進める inheritThenExecute。もう写し終えていることもあるので店から引き直す）
        const { phase } = this.runtimes.get(chat.id).run;
        return { chat, inherited: (phase.kind === "preparing" && phase.why === "inherit") || (deps.store.chats.get(chat.id)?.session_id ?? null) !== null };
      },
    };
    // 再起動しても送信待ちの列は残す（読み戻した列は止めておく）
    this.runtimes = new ChatRuntimes({ store: deps.store, bus: deps.bus, editTtlMs: deps.editHoldTtlMs, dispatch: (chatId, event) => this.dispatch(chatId, event) });
    // 前回、AI が指示を受け取る途中でアプリが終了した場合、自動再送せず確認を待つ。
    deps.store.chatProviderHandoffs.recoverInterrupted();
    // 前回の終了で作業の途中で止まったチャットと、自動で送るまま送信待ちが残ったチャットは、起動しただけでは続けず・送らず、利用者に聞く（restartResumes）
    const interrupted = new Set(deps.interrupted ?? []);
    const queued = new Set(deps.store.outbox.list().map((saved) => saved.chatId).filter((chatId) => this.waitsForResume(chatId)));
    for (const chatId of new Set([...interrupted, ...queued])) this.dispatch(chatId, { type: "gates", patch: { restart: { interrupted: interrupted.has(chatId), queued: queued.has(chatId) } } });
    this.workplaceMoves = new WorkplaceReservations(this.runtimes);
    this.turnDeps.workplaceMoves = { reserve: (chatId, plan) => this.workplaceMoves.reserve(chatId, plan), cancel: (chatId) => this.workplaceMoves.cancel(chatId) !== null };
    this.recovery = new ChatRecovery({ store: deps.store, approvals: deps.approvals, runtimes: this.runtimes, dispatch: (chatId, event) => this.dispatch(chatId, event), send: (chatId, text) => this.send(chatId, text), usage: deps.usage, reconnect: deps.reconnect, usageLimit: deps.usageLimit });
  }

  /** 上の機能の口（ノート・DB・Docker・ワークツリーの実行環境と後始末・内蔵ターミナル・ブラウザ・AI のツールの組）を渡す。上の機能は Runner を使うので、組み立ての最後に渡す（渡すまでは AI にそのツールを出さない） */
  attach(upper: Pick<ExecutionDeps, "notes" | "noteDirOf" | "databases" | "worktreeEnvs" | "worktreeFinisher" | "terminals" | "browser" | "aiTools">) {
    Object.assign(this.deps, upper);
    Object.assign(this.turnDeps, upper);
  }

  /** チャットのアーカイブ・削除（AI の archive_chat・delete_chat の中身）を渡す。作業中か・送信待ちを止めるのに Runner を使うので、Runner を作ったあとで渡す */
  useChatRemover(remover: ChatRemover) {
    this.turnDeps.chatRemover = remover;
  }


  protected preCompactOf(projectId: number): string | null {
    const project = this.deps.store.projects.get(projectId);
    return project ? preCompactPromptOf(this.deps.store, project) : null;
  }

  protected turnEndTasks(chatId: number, runtime: ChatRuntime, effect: Extract<Effect, { do: "run_turn_end_tasks" | "drop_turn_end_tasks" }>) {
    const move = this.workplaceMoves.take(chatId);
    if (effect.do === "drop_turn_end_tasks") {
      if (move && effect.notice) recordEvent(this.deps.store, runtime, { type: "notice", message: notMovedNotice(move) });
      return;
    }
    const settled = () => this.dispatch(chatId, { type: "settled", then: effect.then });
    if (move) void this.moveThenContinue(chatId, move).then(settled);
    else settled();
  }

  /** 起動すると送り始める送信待ちか（指示があり、自動で送るで、先頭の上に一時停止の線がなく、作業していない） */
  private waitsForResume(chatId: number): boolean {
    const { outbox } = this.runtimes.get(chatId).run;
    return outbox.later.length > 0 && !outbox.paused && outbox.stops[0] !== 0 && !this.isBusy(chatId);
  }

  /** 切り替えを排他的に準備する。確認中に送信待ちが変わった場合は古い内容で確定しない。 */
  async switchProvider(chatId: number, expectedProvider: ProviderId, target: ProviderId, requireConfirmation?: () => void): Promise<{ chat: Chat; warning: string | null }> {
    const chat = this.requireChat(chatId);
    this.requireIdle(chatId, "AI の切り替え");
    if (chat.provider !== expectedProvider || chat.provider === target || !providerCan(target, "switch") || !providerCan(chat.provider, "switch")) throw new Conflict("チャットの状態が変わったため、AI を切り替えられません");
    const blocked = handoffBlocksSwitch(this.deps.store.chatProviderHandoffs.get(chatId), chat.provider);
    if (blocked) throw new Conflict(blocked);
    const uploads = this.deps.uploads;
    if (!uploads) throw new Conflict("添付の保存先がないため、AI を切り替えられません");
    const runtime = this.runtimes.get(chatId);
    const initialQueue = queueSnapshot(runtime);
    const initialSignature = JSON.stringify(initialQueue);
    this.dispatch(chatId, { type: "begin", why: "switch_provider" });
    let switched = false;
    try {
      const provider = this.deps.providers[target];
      const status = await provider.status();
      const auth = await this.deps.providerKeys?.authFor(target);
      if (!provider.implemented || !status.implemented || !status.installed) throw new Conflict("切り替え先の AI が利用できません");
      if (auth?.mode === "api_key" ? !auth.apiKey : !status.logged_in) throw new Conflict("切り替え先の AI にログインまたは API キーの設定が必要です");
      const requireStable = () => {
        const { phase } = runtime.run;
        if (phase.kind !== "preparing" || phase.why !== "switch_provider" || JSON.stringify(queueSnapshot(runtime)) !== initialSignature) throw new Conflict("送信待ちやチャットの状態が変わったため、AI を切り替えられません");
        requireConfirmation?.();
      };
      const result = await prepareAndCommitProviderSwitch({ store: this.deps.store, uploads, requireIdle: requireStable }, { chatId, expectedProvider, target, queueWasPaused: initialQueue.paused, queuedIds: initialQueue.messages.map((message) => message.id) });
      switched = true;
      return result;
    } finally {
      this.dispatch(chatId, { type: "prepared", ...(switched ? { next: "send_next" as const } : {}) });
      // 切り替えに失敗したとき、準備中に増えた指示を意図せず元の AI に送らない。
      if (!switched && JSON.stringify(queueSnapshot(runtime)) !== initialSignature && runtime.outbox.later.length > 0) this.dispatch(chatId, { type: "set_paused", paused: true });
    }
  }

  /** 送信前の引き継ぎ失敗をやり直す。すでに記録した指示は同じ発言として再開する。 */
  async retryProviderHandoff(chatId: number): Promise<{ warning: string | null }> {
    this.requireChat(chatId);
    this.requireIdle(chatId, "AI の引き継ぎの再試行");
    const { store, uploads } = this.deps;
    const pending = store.chatProviderHandoffs.get(chatId);
    if (!pending || pending.state !== "blocked") throw new Conflict("再試行できる AI の引き継ぎがありません");
    if (!uploads) throw new Conflict("添付の保存先がないため、引き継ぎを再試行できません");
    const runtime = this.runtimes.get(chatId);
    this.dispatch(chatId, { type: "begin", why: "handoff_retry" });
    let started = false;
    let recovered = false;
    let claimed = false;
    try {
      const attempt = store.events.list(chatId, { after: pending.eventId, types: ["user"], limit: 1 })[0];
      const prompt = attempt?.type === "user" ? (await followupPrompt(this.deps, chatId, attempt.data.text, attempt.data.attachments ?? [])).prompt : null;
      const result = await retryProviderHandoffPreparation({ store, uploads, requireIdle: () => {
        const { phase } = runtime.run;
        if (phase.kind !== "preparing" || phase.why !== "handoff_retry") throw new Conflict("チャットの状態が変わったため、再試行できません");
      } }, chatId, attempt?.type === "user");
      claimed = attempt?.type === "user";
      if (attempt?.type === "user" && prompt !== null) {
        store.chats.update(chatId, { status: "running", error: null, unread: false });
        started = true;
        void this.execute(chatId, { chatId, prompt, promptId: attempt.data.message_uuid, claimedHandoffEventId: pending.eventId }, "message", null);
      }
      recovered = true;
      return result;
    } catch (error) {
      // 再準備後の失敗でも、元の指示を飛ばして次の待ちを送らない。
      if (claimed) store.chatProviderHandoffs.blockBeforeSend(chatId, pending.eventId, errorMessage(error));
      else store.chatProviderHandoffs.blockReady(chatId, pending.eventId, errorMessage(error));
      throw error;
    } finally {
      if (!started) this.dispatch(chatId, { type: "prepared", ...(recovered ? { next: "send_next" as const } : {}) });
    }
  }

  /** 受信不明時に利用者が重複の可能性を承知して再送を選んだ場合だけ実行する。 */
  async confirmResendProviderHandoff(chatId: number, eventId: number): Promise<{ warning: string | null }> {
    this.requireChat(chatId);
    this.requireIdle(chatId, "AI の引き継ぎの再送");
    if (!this.deps.store.chatProviderHandoffs.confirmResend(chatId, eventId)) throw new Conflict("AI の引き継ぎ状態が変わりました。確認し直してください");
    return this.retryProviderHandoff(chatId);
  }

  /**
   * 起動したときの再開の確かめ: 前回の終了で、作業の途中で止まった・自動で送るまま送信待ちが残ったチャット（答えるまで続けない・送らない）。
   * 選ぶ前に中身を見られるよう、送信待ちのすべてと、止まったところ・止まったサブエージェントを添える。
   * 聞くことがなくなったもの（送信待ちが空になった・アーカイブした・消した）は外す
   */
  restartResumes(): RestartResume[] {
    const { store } = this.deps;
    const out: RestartResume[] = [];
    for (const runtime of this.runtimes.all()) {
      const { chatId } = runtime;
      const resume = runtime.run.gates.restart;
      if (!resume) continue;
      const chat = store.chats.get(chatId);
      if (!chat || chat.archived_at !== null) {
        this.settleResume(chatId);
        continue;
      }
      const { later: messages, stops } = runtime.outbox;
      const queued = resume.queued && messages.length > 0;
      if (!queued && !resume.interrupted) {
        this.dispatch(chatId, { type: "gates", patch: { restart: null } });
        continue;
      }
      if (queued !== resume.queued) this.dispatch(chatId, { type: "gates", patch: { restart: { interrupted: resume.interrupted, queued } } });
      out.push({ chat_id: chatId, project_id: chat.project_id, title: chat.title, interrupted: resume.interrupted, queued, messages: queued ? messages : [], stops: queued ? stops : [], ...resumeMomentsOf(store.events.recent(chatId, RESUME_EVENTS)), subagents: resume.interrupted ? this.stoppedSubagents(chatId) : [] });
    }
    return out.sort((a, b) => a.chat_id - b.chat_id);
  }

  /**
   * 起動したときの再開の確かめに答える（チャットごと。答えなかったチャットは待ったまま = 「あとで」）。
   * 送る: 送信待ちだけを送る（自動で送るのまま先頭を送る）/ 続ける: 中断した作業を続けるよう頼み（止まったサブエージェントの再開も）、
   * 送信待ちはその作業が終わってから送る（中断していなければ、送ると同じ）/ 止めておく: 送信待ちは止めています、作業は止めたまま。
   * 送信待ちのないチャットに「送る」は 400（どれも変えない）。自分で送って作業中なら、続けるは頼まず、送信待ちはその作業の終わりで送る。
   * 確かめを待っていないチャットは飛ばす
   */
  async resolveRestartResumes(decisions: { chatId: number; action: RestartResumeAction }[]): Promise<void> {
    for (const { chatId, action } of decisions) {
      if (action === "send" && this.runtimes.peek(chatId)?.run.gates.restart?.queued === false) throw new Invalid("送信待ちのないチャットには「送る」を選べません");
    }
    for (const { chatId, action } of decisions) {
      const resume = this.runtimes.get(chatId).run.gates.restart;
      if (!resume) continue;
      // 続けるなら、止まったサブエージェントは答えを消す前に探す
      const agents = action === "continue" && resume.interrupted ? this.stoppedSubagents(chatId).map((a) => ({ agentId: a.agent_id, description: a.description })) : [];
      await Promise.all(this.dispatch(chatId, { type: "answer_restart", action, agents }).started);
    }
  }

  /** 起動したときの再開の確かめに答えた・聞くことがなくなった: 印を外す（次の起動でも聞かない） */
  private settleResume(chatId: number) {
    const runtime = this.runtimes.peek(chatId);
    if (!runtime) return;
    const interrupted = runtime.run.gates.restart?.interrupted ?? false;
    this.dispatch(chatId, { type: "gates", patch: { restart: null } });
    if (interrupted) this.deps.store.chats.setResumePending([chatId], false);
  }

  /** 前回の終了で作業の途中で止まったサブエージェント（最後の自分の指示より後の記録から） */
  private stoppedSubagents(chatId: number) {
    const { events } = this.deps.store;
    const since = events.latestUserId(chatId) ?? 0;
    return stoppedSubagentsOf(events.after(chatId, since), since);
  }

  /** 作業中の様子（チャットの詳細の live。SSE の chat_live と同じ形） */
  live(chatId: number): ChatLive {
    return this.runtimes.live(chatId);
  }

  /** つながったら自動で再開するのをやめる（待っていなければ 409） */
  stopReconnect(chatId: number): void {
    this.run(chatId, { type: "stop_reconnect" });
  }

  async start(input: StartChatInput): Promise<Chat> {
    const { chat, prompt, messageUuid } = await createChat(this.deps, input);
    const item = { chatId: chat.id, prompt, promptId: messageUuid };
    if (input.prepareSession) this.inheritThenExecute(chat.id, input.prepareSession, item);
    else void this.execute(chat.id, item, "message", null);
    return this.deps.store.chats.get(chat.id)!;
  }

  /**
   * 親の会話を写してから動かす（子チャット）。写す間（親の記録が大きいと数十秒）も作業中として数え（送る準備 inherit）、画面には
   * ChatLive.inheriting で「親の会話を引き継いでいます」を出す（写し終えるのを待たずに子チャットを作り、送った発言と作業中の行を出す）。
   * この間の「いま」は預かり、動かし始めたらその作業に伝える。止めたら、写し終えたところで動かさずに中断で終える。
   * 写せなければ、引き継がずに始めることをお知らせに残して動かす
   */
  private inheritThenExecute(chatId: number, prepare: () => Promise<string>, item: TurnRequest) {
    const { store } = this.deps;
    const runtime = this.runtimes.get(chatId);
    this.dispatch(chatId, { type: "begin", why: "inherit" });
    void (async () => {
      let sessionId: string | null = null;
      try {
        sessionId = await prepare();
      } catch (e) {
        if (store.chats.get(chatId)) recordEvent(store, runtime, { type: "notice", message: `親の会話を引き継げませんでした（${errorMessage(e)}）。会話を引き継がずに始めます` });
      }
      // 写している間にチャットを消した・アプリを終える
      if (!store.chats.get(chatId) || this.shuttingDown) {
        if (this.runtimes.peek(chatId)) this.dispatch(chatId, { type: "prepared" });
        return;
      }
      if (sessionId) store.chats.update(chatId, { session_id: sessionId });
      void this.execute(chatId, item, "message", null);
    })();
  }

  /** 裏で動いている作業を 1 つ止める（サブエージェント・コマンド。作業中でなければ 409） */
  async stopBackgroundTask(chatId: number, taskId: string): Promise<void> {
    const control = this.runtimes.get(chatId).handle?.control;
    if (!control) throw new Conflict("このチャットは作業中ではありません");
    await control.stopTask(taskId);
  }

  /** チャットを消したとき: 作業中の状態（送信待ちの列も）を捨て、再開の段取りもやめる */
  forget(chatId: number) {
    if (this.runtimes.peek(chatId)) this.dispatch(chatId, { type: "forget_recovery" });
    for (const resolve of this.tellWaits.get(chatId)?.values() ?? []) resolve("held");
    this.tellWaits.delete(chatId);
    this.told.delete(chatId);
    this.runtimes.forget(chatId);
  }

  /**
   * チャットの作業場所を移す（中身は workplaceMove.ts の moveChatWorkplace）。
   * 利用者・AI が移すときは作業中なら 409。移している間（会話を写す間）も作業中として数え（送る準備 move_workplace）、その間の「いま」は預かって、
   * 利用者が移したなら済んでから送る。止まったあとの再開を待っていたら、待つのをやめる（再開の指示を移した先で送らない。止めた送信待ちは止めたまま）
   */
  async moveWorkplace(chatId: number, input: WorkplaceMoveInput, steps?: WorkplaceMoveSteps): Promise<Chat> {
    // AI の予約は作業の終わりに Runner が移す（作業中として数えたまま呼ぶ）ので、確かめるのは利用者が移すときだけ
    if (input.reason === "user") this.requireIdle(chatId, "作業場所の変更");
    this.dispatch(chatId, { type: "begin", why: "move_workplace" });
    try {
      this.dispatch(chatId, { type: "forget_recovery" });
      // 移す前の用意（新しいワークツリーを作る・変更を持っていく）も作業中として数える間に行い、移せなければ元に戻す
      const prepared = { ...input, ...(await steps?.before?.()) };
      try {
        const chat = await moveChatWorkplace({ store: this.deps.store, providers: this.deps.providers, sessionTrash: this.deps.sessionTrash }, chatId, prepared);
        await steps?.after?.();
        return chat;
      } catch (e) {
        await steps?.undo?.().catch(() => {});
        throw e;
      }
    } finally {
      this.dispatch(chatId, { type: "prepared", ...(input.reason === "user" ? { next: "deliver" as const } : {}) });
    }
  }

  /**
   * AI が予約した作業場所の移動を利用者が取り消す（画面・スマホの取り消し。会話にお知らせを残す。予約がなければ 409）。
   * 取り消したことは AI にも伝える: 作業中で足せるなら、いまの作業にその場で足す（次の切れ目で読む）。足せない（作業していない・圧縮の間・入力を閉じた）なら、
   * 知らせのためだけに動かさず、次に送るもの（新しい実行の文脈か、次に伝える発言の頭）に一度だけ添える
   */
  cancelWorkplaceMove(chatId: number) {
    const plan = this.workplaceMoves.cancel(chatId);
    if (!plan) throw new Conflict("取り消す予約はありません（もう移したか、取り消しました）");
    const runtime = this.runtimes.get(chatId);
    recordEvent(this.deps.store, runtime, { type: "notice", message: `AI が予約した「${plan.label}へ移る」を取り消しました` });
    const note = cancelledNote(plan);
    const told = runtime.busy && holdOf(runtime.run) === null && Boolean(runtime.handle?.control?.tell(note, randomUUID()));
    if (!told) runtime.pendingNote = note;
  }

  /** 作業の終わりに、AI が予約した作業場所の移動を行う（済んだら、いつもの作業の終わりの続きを settled で決める） */
  private moveThenContinue(chatId: number, plan: WorkplaceMovePlan) {
    const { store, terminals, worktreeEnvs } = this.deps;
    return runReservedMove({ store, runtimes: this.runtimes, isBusy: (id) => this.isBusy(id), moveWorkplace: (id, input, steps) => this.moveWorkplace(id, input, steps), worktreeFinisher: this.turnDeps.worktreeFinisher, terminals, worktreeEnvs }, chatId, plan);
  }

  /**
   * 会話を要約して、コンテキストを空ける（Claude Code の /compact を手で実行する）。会話の記録には発言として残さず、要約したこと（compact イベント）だけが残る。
   * 作業中なら、圧縮前指示をいまの作業に足すか、予約する（送信待ちのいちばん上に圧縮の行）。圧縮前指示があれば、先にその指示を送り、その作業が最後まで終わってから圧縮する
   */
  async compact(chatId: number): Promise<Chat> {
    this.requireChat(chatId);
    await Promise.all(this.run(chatId, { type: "compact" }).started);
    return this.requireChat(chatId);
  }

  /** 手でコンテキストを消去する: 作業していなければその場で消去し、送信待ちがあれば次を送る。作業中なら、いまのやり取りが終わったらすぐ消去する予約 */
  clear(chatId: number): Chat {
    this.requireChat(chatId);
    this.run(chatId, { type: "clear", pump: true });
    return this.requireChat(chatId);
  }

  /** コンテキストを消去する（セッションを外し、次の指示から新しい会話。記録は残し、区切り context_cleared を残す）。作業中・まだ会話がなければ 409 */
  clearContext(chatId: number): Chat {
    this.requireChat(chatId);
    this.requireIdle(chatId, "コンテキストの消去");
    this.run(chatId, { type: "clear", pump: false });
    return this.requireChat(chatId);
  }

  /** 止めるよう頼む（Claude Code のプロセスがサブエージェント・裏のコマンドごと終わるまで、画面は停止ボタンを「停止中…」にする） */
  cancel(chatId: number) {
    this.dispatch(chatId, { type: "cancel" });
  }

  /** 作業中のチャット（送る準備・親の会話を写している途中も。ID の順） */
  busyChats(): { id: number; title: string | null }[] {
    return this.runtimes
      .all()
      .filter((r) => r.busy)
      .map((r) => this.deps.store.chats.get(r.chatId))
      .filter((c): c is Chat => c !== undefined)
      .map((c) => ({ id: c.id, title: c.title }))
      .sort((a, b) => a.id - b.id);
  }

  /** 実行中のエージェントの数（接続の詳細の表示用） */
  stats(): { running: number } {
    return { running: this.runtimes.running().length };
  }

  /** チャット（なければ 404） */
  protected requireChat(chatId: number): Chat {
    const chat = this.deps.store.chats.get(chatId);
    if (!chat) throw new NotFound("チャットが見つかりません");
    return chat;
  }

  isBusy(chatId: number): boolean {
    const runtime = this.runtimes.peek(chatId);
    return runtime ? busyState(runtime.run) : false;
  }

  /** 作業中（送る準備の途中も）なら 409。action は「削除」「分岐」などの、できない操作の名前 */
  requireIdle(chatId: number, action: string): void {
    if (this.isBusy(chatId)) throw new Conflict(`作業中のチャットは${action}できません。終わってから（または中断してから）行ってください`);
  }

  /**
   * アプリ終了時: 実行中のエージェントをすべて止める。止める前に、作業中（送る準備・親の会話を写している途中も）と、
   * 通信の切断でつながるのを待っていたチャットに起動したときの再開の確かめの印を付ける（止めると中断で終わり、作業中のまま残らないため。
   * 使用枠の上限を待っていたものは付けない = 戻る時刻が分かれば、そのとき聞く）
   */
  shutdown() {
    this.shuttingDown = true;
    const stopped = this.runtimes.all().filter((r) => r.busy).map((r) => r.chatId);
    this.deps.store.chats.setResumePending([...new Set([...stopped, ...this.recovery.waitingForReconnect()])], true);
    this.recovery.shutdown();
    for (const runtime of this.runtimes.running()) runtime.handle?.abort.abort();
  }
}

/** AI の切り替えで確かめる送信待ちの形（確かめている間に変わったら確定しない） */
const queueSnapshot = (runtime: ChatRuntime) => ({ messages: runtime.outbox.later, paused: queuePaused(runtime.run), stops: runtime.outbox.stops });

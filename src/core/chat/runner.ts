import { randomUUID } from "node:crypto";
import { FollowupQueue } from "./queue.js";
import { QueueEditHolds } from "@shared/chat/queueEditHolds";
import type { TurnControl } from "../providers/types.js";
import { executeTurn, type ExecutionDeps, type QueueItem, type TurnOutcome } from "./turn.js";
import { RunnerQueue } from "./runnerQueue.js";
import { ChatReconnect } from "./recovery/reconnect.js";
import { ChatStopping } from "./stopping.js";
import { ChatUsageLimit } from "./recovery/usageLimit.js";
import { createChat, followupPrompt, type StartChatInput } from "./input.js";
import type { Attachment, BackgroundState, ReconnectState, Chat, ChatOptionsPatch } from "@shared/types";
import type { UsageMonitor } from "../usage/planUsage.js";

/**
 * エージェントの実行を管理する。
 * 送った指示はすぐ動かす（同時に動かす数は決めない）。
 * 1 つの実行（Run）は 1 つの会話で、追加のメッセージを送ると同じセッションを続きから再開する。
 * 作業中のチャットに送った次の指示は、チャットごとの待ちの列（followups）に入れ、作業が終わったら（止めた・失敗したときも）順に送る。
 * 1 回の実行の中身（作業場所・プロバイダーの呼び出し・結果の反映）は turn.ts、
 * 通信が切れて止まったときの再開の段取り（送信待ちを止める・つながったら再開・何度も止まったら聞く）は reconnect.ts
 */
export class Runner extends RunnerQueue {
  private readonly active = new Map<number, AbortController>();
  protected readonly followups: FollowupQueue;
  protected readonly editHolds: QueueEditHolds;
  /** アプリを終えるところ（待ちの列を送らない） */
  private shuttingDown = false;

  /** 通信が切れて止まったチャットの再開 */
  private readonly reconnect: ChatReconnect;
  /** 使用枠の上限で止まったときの段取り（送信待ちを止め、枠が戻ったら続けるかを聞く。usageLimit.ts） */
  private readonly usageLimit: ChatUsageLimit;
  /** 作業中のチャットの、裏で動いている作業の様子（executeTurn が書き、詳細の API で返す） */
  private readonly background = new Map<number, BackgroundState>();
  /** 作業中のチャットへの操作（止めずに発言を足す・裏の作業を止める。プロバイダーが渡す） */
  private readonly controls = new Map<number, TurnControl>();
  /** 会話を圧縮している最中のチャットと、始めた時刻（executeTurn が書き、詳細の API で返す） */
  private readonly compacting = new Map<number, string>();
  /** 止めるよう頼んで、終わるのを待っているチャット（stopping.ts） */
  private readonly stopping: ChatStopping;
  /**
   * 送る準備をしているチャット（send で作業中かを確かめてから、指示を組み立てて動かし始めるまで）。作業中として数える。
   * 組み立ての間（await）に別の送信（送信待ちの自動送信と「いま」など）が割り込むと、同じチャットを 2 つ同時に動かし、片方の指示が会話から消えていた
   */
  private readonly preparing = new Set<number>();

  constructor(
    private readonly deps: ExecutionDeps & {
      usage: UsageMonitor;
      /** つながったかの確かめ方と間隔（テストで差し替える） */
      reconnect?: { check?: () => Promise<boolean>; intervalMs?: number };
      /** 使用枠が戻ったかを確かめる時計と間隔（テストで差し替える） */
      usageLimit?: { now?: () => number; checkMs?: number };
      /** 書き直している印の持ち時間（テストで差し替える） */
      editHoldTtlMs?: number;
    },
  ) {
    super();
    this.stopping = new ChatStopping(deps);
    this.followups = new FollowupQueue(
      (chatId) => this.queueChanged(chatId),
      // 再起動しても残す（読み戻した列は止めておく）
      deps.store.queues,
    );
    this.editHolds = new QueueEditHolds((chatId) => this.editHoldsChanged(chatId), deps.editHoldTtlMs);
    // 止まったときにこちらで止めた送信待ち（通信の切断・使用枠の上限のどちらで止めても 1 つで覚え、続けて別の理由で止まっても引き継ぐ）
    const heldQueues = new Set<number>();
    this.reconnect = new ChatReconnect({
      store: deps.store,
      approvals: deps.approvals,
      bus: deps.bus,
      followups: this.followups,
      heldQueues,
      isBusy: (chatId) => this.isBusy(chatId),
      send: (chatId, text) => this.send(chatId, text),
      ...deps.reconnect,
    });
    this.usageLimit = new ChatUsageLimit({
      store: deps.store,
      approvals: deps.approvals,
      followups: this.followups,
      heldQueues,
      isBusy: (chatId) => this.isBusy(chatId),
      send: (chatId, text) => this.send(chatId, text),
      usage: deps.usage,
      ...deps.usageLimit,
    });
  }

  /** 待ちの列の様子を画面に配る（列・止めておくか・一時停止の位置・書き直しを待っているか） */
  protected queueChanged(chatId: number) {
    const chat = this.deps.store.chats.get(chatId);
    if (!chat) return;
    this.deps.bus?.publish({
      type: "chat_queue",
      project_id: chat.project_id,
      chat_id: chatId,
      queue: this.followups.list(chatId),
      paused: this.followups.isPaused(chatId),
      stops: this.followups.stopsOf(chatId),
      waiting_edit: this.queueWaitingForEdit(chatId),
    });
  }

  /** 裏で動いている作業の様子（作業中でなければ null） */
  backgroundState(chatId: number): BackgroundState | null {
    return this.background.get(chatId) ?? null;
  }

  /** 会話を圧縮している最中なら、始めた時刻（していなければ null） */
  compactingSince(chatId: number): string | null {
    return this.compacting.get(chatId) ?? null;
  }

  /** つながったら自動で再開するのを待っているか（null なら待っていない） */
  reconnectState(chatId: number): ReconnectState | null {
    return this.reconnect.state(chatId);
  }

  /** つながったら自動で再開するのをやめる（待っていたら true） */
  stopReconnect(chatId: number): boolean {
    return this.reconnect.stopWaiting(chatId);
  }

  async start(input: StartChatInput): Promise<Chat> {
    const { chat, prompt, messageUuid } = await createChat(this.deps, input);
    void this.execute({ chatId: chat.id, prompt, promptId: messageUuid });
    return this.deps.store.chats.get(chat.id)!;
  }

  /** 終了した会話に追加の指示を送り、続きから再開する */
  async send(chatId: number, text: string, options: ChatOptionsPatch = {}, attachments: Attachment[] = []): Promise<Chat> {
    const { store } = this.deps;
    const chat = store.chats.get(chatId);
    if (!chat) throw new Error("実行が見つかりません");
    if (this.isBusy(chatId)) throw new Error("エージェントが作業中です。終わってから送ってください");
    // 動かし始めるまで作業中として数える（組み立ての間に届いた送信は、作業中のチャットへの送信として扱われる）
    this.preparing.add(chatId);
    let prepared: Awaited<ReturnType<typeof followupPrompt>>;
    try {
      prepared = await followupPrompt(this.deps, chatId, text, attachments);
    } catch (e) {
      this.preparing.delete(chatId);
      // 送れなかった間に届いた指示（待ちの列）は取り残さない
      void this.sendNextQueued(chatId);
      throw e;
    }
    // 自分で送った: つながったら再開する・再開するかを聞くのをやめる（自動の再開から送ったときは続ける）
    this.forgetRecovery(chatId);
    const { prompt, handover } = prepared;
    const messageUuid = randomUUID();
    store.events.add(chat.id, { type: "user", text, ...(attachments.length ? { attachments } : {}), ...handover, message_uuid: messageUuid });
    // チャット欄でモデルや権限モードを変えた場合は、この続きから反映する
    store.chats.update(chat.id, {
      status: "running",
      error: null,
      unread: false,
      ...options,
    });
    // 動かし始めたら作業中（this.active）として数えられるので、準備の印は外す
    this.preparing.delete(chatId);
    void this.execute({ chatId: chat.id, prompt, promptId: messageUuid });
    return store.chats.get(chat.id)!;
  }

  /**
   * 止めずに伝える: 作業中なら、いまのやり取りに発言を足す（メインのエージェントが、いまの手順の切れ目で読む。
   * 裏のサブエージェント・コマンドは動き続ける）。足せないとき（始まる前・要約中など）は待ちの列に入れ（front なら先頭）、
   * 作業中でなければすぐ送る。モデルなどの選択は、作業の途中では変えられないので次に送るときから効く
   */
  async tell(chatId: number, text: string, options: ChatOptionsPatch = {}, attachments: Attachment[] = [], { front = false } = {}): Promise<"told" | "sent" | "queued"> {
    const { store } = this.deps;
    const chat = store.chats.get(chatId);
    if (!chat) throw new Error("実行が見つかりません");
    if (!this.isBusy(chatId)) {
      await this.send(chatId, text, options, attachments);
      return "sent";
    }
    const { prompt, handover } = await followupPrompt(this.deps, chatId, text, attachments);
    const messageUuid = randomUUID();
    // 組み立てている間に始まった・終わった実行もあるので、足し先は組み立てたあとに取り直す
    const control = this.controls.get(chatId);
    if (control?.tell(prompt, messageUuid)) {
      // 自分で送った: つながったら再開する・再開するかを聞くのをやめる
      this.forgetRecovery(chatId);
      store.events.add(chatId, { type: "user", text, ...(attachments.length ? { attachments } : {}), ...handover, message_uuid: messageUuid });
      if (chat.unread) store.chats.setUnread(chatId, false);
      return "told";
    }
    const { id } = this.followups.add(chatId, text, options, attachments);
    if (front) this.followups.move(chatId, id, 0);
    // 組み立てている間に作業が終わっていたら、終わったときの自動送信はもう済んでいるので、ここで送る（列に取り残さない）
    if (!this.isBusy(chatId)) void this.sendNextQueued(chatId);
    return "queued";
  }

  /** 裏で動いている作業を 1 つ止める（サブエージェント・コマンド。作業中でなければ false） */
  async stopBackgroundTask(chatId: number, taskId: string): Promise<boolean> {
    const control = this.controls.get(chatId);
    if (!control) return false;
    await control.stopTask(taskId);
    return true;
  }

  /** チャットを消したとき、待ちの列も消す */
  forgetQueued(chatId: number) {
    this.followups.forget(chatId);
    this.editHolds.forget(chatId);
    this.waitingForEdit.delete(chatId);
    this.forgetRecovery(chatId);
  }

  /** 自分で送った・チャットを消した: 通信・使用枠の上限で止まったあとの再開の段取り（待つ・聞く）をやめる */
  private forgetRecovery(chatId: number) {
    // 再開の段取りが送っているところなら、自分で送ったものではない（止めた送信待ちは 1 つで覚えているので、どちらの段取りも忘れない）
    if (this.reconnect.isResuming(chatId) || this.usageLimit.isResuming(chatId)) return;
    this.reconnect.forget(chatId);
    this.usageLimit.forget(chatId);
  }

  /**
   * 会話を要約して、コンテキストを空ける（Claude Code の /compact を手で実行する）。
   * 会話の記録には発言として残さず、要約したこと（compact イベント）だけが残る。終わっても未読にしない
   */
  async compact(chatId: number): Promise<Chat> {
    const { store } = this.deps;
    const chat = store.chats.get(chatId);
    if (!chat) throw new Error("実行が見つかりません");
    if (this.isBusy(chatId)) throw new Error("エージェントが作業中です。終わってから圧縮してください");
    if (!chat.session_id) throw new Error("まだ会話がないので、圧縮できません");
    store.chats.update(chat.id, { status: "running", error: null });
    void this.execute({ chatId: chat.id, prompt: "/compact", compact: true });
    return store.chats.get(chat.id)!;
  }


  cancel(chatId: number) {
    const controller = this.active.get(chatId);
    if (!controller) return;
    this.stopping.begin(chatId);
    controller.abort();
  }

  /** 止めるよう頼んで、終わるのを待っているところか */
  isStopping(chatId: number): boolean {
    return this.stopping.has(chatId);
  }

  /** 実行中のエージェントの数（接続の詳細の表示用） */
  stats(): { running: number } {
    return { running: this.active.size };
  }

  protected hasChat(chatId: number): boolean {
    return this.deps.store.chats.get(chatId) !== undefined;
  }

  protected reportError(chatId: number, message: string) {
    this.deps.store.events.add(chatId, { type: "error", message });
  }

  isBusy(chatId: number): boolean {
    return this.active.has(chatId) || this.preparing.has(chatId);
  }

  /** アプリ終了時: 実行中のエージェントをすべて止める */
  shutdown() {
    this.shuttingDown = true;
    this.reconnect.shutdown();
    this.usageLimit.shutdown();
    for (const controller of this.active.values()) controller.abort();
  }

  /** 送った指示をすぐ動かす（同時に動かす数は決めない） */
  private async execute(item: QueueItem) {
    const controller = new AbortController();
    this.active.set(item.chatId, controller);
    let outcome: TurnOutcome = { status: "failed", network: false };
    try {
      outcome = await executeTurn({ ...this.deps, background: this.background, controls: this.controls, compacting: this.compacting }, item, controller.signal);
    } finally {
      this.active.delete(item.chatId);
      this.stopping.end(item.chatId);
      void this.deps.usage.refresh();
      // 終わったら、待ちの列の次の指示を送る（完了でも、止めた・失敗したときでも送る。アプリを終えるときは送らない）。
      // 通信が切れた・使用枠の上限で止まったときは送らず、つながる・枠が戻るのを待つ（送っても失敗して消えるため）
      const network = this.reconnect.finished(item.chatId, outcome);
      const usage = this.usageLimit.finished(item.chatId, outcome);
      if (!this.shuttingDown && network && usage) void this.sendNextQueued(item.chatId);
    }
  }
}

import { randomUUID } from "node:crypto";
import { executeTurn, type ExecutionDeps, type QueueItem, type TurnOutcome } from "./turn.js";
import { RunnerQueue } from "./runnerQueue.js";
import { ChatRuntimes } from "./runtime.js";
import { ChatReconnect } from "./recovery/reconnect.js";
import { ChatUsageLimit } from "./recovery/usageLimit.js";
import { createChat, followupPrompt, type StartChatInput } from "./input.js";
import type { Attachment, Chat, ChatLive, ChatOptionsPatch } from "@shared/types";
import type { UsageMonitor } from "../usage/planUsage.js";

/**
 * エージェントの実行を管理する。
 * 送った指示はすぐ動かす（同時に動かす数は決めない）。
 * 1 つのチャットは 1 つの会話で、追加のメッセージを送ると同じセッションを続きから再開する。
 * チャットごとの作業中の状態（動かしている実行・送信待ちの列・裏の作業・再試行・圧縮中・停止中）は runtime.ts の ChatRuntime に 1 つずつ持ち、
 * 変わったらまとめて画面に配る（SSE の chat_live）。作業中のチャットに送った次の指示は送信待ちの列に入れ、作業が終わったら（止めた・失敗したときも）順に送る。
 * 1 回の実行の中身（作業場所・プロバイダーの呼び出し・結果の反映）は turn.ts、
 * 通信が切れて止まったときの再開の段取り（送信待ちを止める・つながったら再開・何度も止まったら聞く）は recovery/
 */
export class Runner extends RunnerQueue {
  protected readonly runtimes: ChatRuntimes;
  /** アプリを終えるところ（待ちの列を送らない） */
  private shuttingDown = false;

  /** 通信が切れて止まったチャットの再開 */
  private readonly reconnect: ChatReconnect;
  /** 使用枠の上限で止まったときの段取り（送信待ちを止め、枠が戻ったら続けるかを聞く。usageLimit.ts） */
  private readonly usageLimit: ChatUsageLimit;

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
    // 再起動しても送信待ちの列は残す（読み戻した列は止めておく）
    this.runtimes = new ChatRuntimes({
      store: deps.store,
      bus: deps.bus,
      editTtlMs: deps.editHoldTtlMs,
      onEditsChanged: (chatId) => this.editsChanged(chatId),
      reconnectOf: (chatId) => this.reconnect.state(chatId),
    });
    const queueOf = (chatId: number) => this.runtimes.get(chatId).queue;
    // 止まったときにこちらで止めた送信待ち（通信の切断・使用枠の上限のどちらで止めても 1 つで覚え、続けて別の理由で止まっても引き継ぐ）
    const heldQueues = new Set<number>();
    this.reconnect = new ChatReconnect({
      store: deps.store,
      approvals: deps.approvals,
      queueOf,
      changed: (chatId) => this.runtimes.publish(chatId),
      heldQueues,
      isBusy: (chatId) => this.isBusy(chatId),
      send: (chatId, text) => this.send(chatId, text),
      ...deps.reconnect,
    });
    this.usageLimit = new ChatUsageLimit({
      store: deps.store,
      approvals: deps.approvals,
      queueOf,
      heldQueues,
      isBusy: (chatId) => this.isBusy(chatId),
      send: (chatId, text) => this.send(chatId, text),
      usage: deps.usage,
      ...deps.usageLimit,
    });
  }

  /** 作業中の様子（チャットの詳細の live。SSE の chat_live と同じ形） */
  live(chatId: number): ChatLive {
    return this.runtimes.live(chatId);
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
    const runtime = this.runtimes.get(chatId);
    runtime.preparing = true;
    let prepared: Awaited<ReturnType<typeof followupPrompt>>;
    try {
      prepared = await followupPrompt(this.deps, chatId, text, attachments);
    } catch (e) {
      runtime.preparing = false;
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
    // 動かし始めたら作業中（runtime.turn）として数えられるので、準備の印は外す
    runtime.preparing = false;
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
    const runtime = this.runtimes.get(chatId);
    // 組み立てている間に始まった・終わった実行もあるので、足し先は組み立てたあとに取り直す
    if (runtime.control?.tell(prompt, messageUuid)) {
      // 自分で送った: つながったら再開する・再開するかを聞くのをやめる
      this.forgetRecovery(chatId);
      store.events.add(chatId, { type: "user", text, ...(attachments.length ? { attachments } : {}), ...handover, message_uuid: messageUuid });
      if (chat.unread) store.chats.setUnread(chatId, false);
      return "told";
    }
    const { id } = runtime.queue.add(text, options, attachments);
    if (front) runtime.queue.move(id, 0);
    // 組み立てている間に作業が終わっていたら、終わったときの自動送信はもう済んでいるので、ここで送る（列に取り残さない）
    if (!this.isBusy(chatId)) void this.sendNextQueued(chatId);
    return "queued";
  }

  /** 裏で動いている作業を 1 つ止める（サブエージェント・コマンド。作業中でなければ false） */
  async stopBackgroundTask(chatId: number, taskId: string): Promise<boolean> {
    const control = this.runtimes.get(chatId).control;
    if (!control) return false;
    await control.stopTask(taskId);
    return true;
  }

  /** チャットを消したとき: 作業中の状態（送信待ちの列も）を捨て、再開の段取りもやめる */
  forget(chatId: number) {
    this.forgetRecovery(chatId);
    this.runtimes.forget(chatId);
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

  /**
   * 止めるよう頼む。Claude Code のプロセスがサブエージェント・裏のコマンドごと終わるまで（ふつうは 2 秒ほど、応じなければ SDK が 5 秒後に強制終了する）、
   * 画面は停止ボタンを「停止中…」にする（作業中の様子の stopping。2 回目以降は知らせない）
   */
  cancel(chatId: number) {
    const runtime = this.runtimes.get(chatId);
    if (!runtime.turn) return;
    runtime.update({ stopping: true });
    runtime.turn.abort();
  }

  /** 実行中のエージェントの数（接続の詳細の表示用） */
  stats(): { running: number } {
    return { running: this.runtimes.running().length };
  }

  protected hasChat(chatId: number): boolean {
    return this.deps.store.chats.get(chatId) !== undefined;
  }

  protected reportError(chatId: number, message: string) {
    this.deps.store.events.add(chatId, { type: "error", message });
  }

  isBusy(chatId: number): boolean {
    return this.runtimes.isBusy(chatId);
  }

  /** アプリ終了時: 実行中のエージェントをすべて止める */
  shutdown() {
    this.shuttingDown = true;
    this.reconnect.shutdown();
    this.usageLimit.shutdown();
    for (const runtime of this.runtimes.running()) runtime.turn?.abort();
  }

  /** 送った指示をすぐ動かす（同時に動かす数は決めない） */
  private async execute(item: QueueItem) {
    const runtime = this.runtimes.get(item.chatId);
    const controller = new AbortController();
    runtime.turn = controller;
    let outcome: TurnOutcome = { status: "failed", network: false };
    try {
      outcome = await executeTurn(this.deps, runtime, item, controller.signal);
    } finally {
      runtime.turn = null;
      // 止めるよう頼んでいたら、終わったので停止中を消す
      runtime.update({ stopping: false });
      void this.deps.usage.refresh();
      // 終わったら、待ちの列の次の指示を送る（完了でも、止めた・失敗したときでも送る。アプリを終えるときは送らない）。
      // 通信が切れた・使用枠の上限で止まったときは送らず、つながる・枠が戻るのを待つ（送っても失敗して消えるため）
      const network = this.reconnect.finished(item.chatId, outcome);
      const usage = this.usageLimit.finished(item.chatId, outcome);
      if (!this.shuttingDown && network && usage) void this.sendNextQueued(item.chatId);
    }
  }
}

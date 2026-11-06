import { randomUUID } from "node:crypto";
import { executeTurn, type ExecutionDeps, type TurnRequest, type TurnOutcome } from "./turn.js";
import { RunnerQueue, type SendOpts } from "./runnerQueue.js";
import { ChatRuntimes, type ChatRuntime } from "./runtime.js";
import { ChatRecovery } from "./recovery/recovery.js";
import { createChat, followupPrompt, type StartChatInput } from "./input.js";
import type { Attachment, Chat, ChatLive, ChatOptionsPatch, CompactTrigger, QueuedMessage, TellResult } from "@shared/types";
import type { UsageMonitor } from "../usage/planUsage.js";
import { Conflict, NotFound } from "../http/errors.js";
import { errorMessage } from "@shared/errors";
import { manualPreCompactMessage, postCompactMessage } from "@shared/chat/prompts";
import { preCompactPromptOf } from "./preCompact.js";

/**
 * エージェントの実行を管理する。
 * 送った指示はすぐ動かす（同時に動かす数は決めない）。
 * 1 つのチャットは 1 つの会話で、追加のメッセージを送ると同じセッションを続きから再開する。
 * チャットごとの作業中の状態（動かしている実行・送信待ちの列・裏の作業・再試行・圧縮中・停止中）は runtime.ts の ChatRuntime に 1 つずつ持ち、
 * 変わったらまとめて画面に配る（SSE の chat_live）。作業中のチャットに送った次の指示は送信待ちの列に入れ、作業が終わったら（止めた・失敗したときも）順に送る。
 * 1 回の実行の中身（作業場所・プロバイダーの呼び出し・結果の反映）は turn.ts、
 * 通信の切断・使用枠の上限で止まったときの再開の段取り（送信待ちを止める・待つ・聞く・再開する）は recovery/
 */
export class Runner extends RunnerQueue {
  protected readonly runtimes: ChatRuntimes;
  /** アプリを終えるところ（待ちの列を送らない） */
  private shuttingDown = false;

  /** 通信の切断・使用枠の上限で止まったあとの再開の段取り */
  private readonly recovery: ChatRecovery;

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
      onCompactEnded: (chatId) => this.deliverAfterCompact(chatId),
    });
    this.recovery = new ChatRecovery({
      store: deps.store,
      approvals: deps.approvals,
      runtimes: this.runtimes,
      isBusy: (chatId) => this.isBusy(chatId),
      send: (chatId, text) => this.send(chatId, text),
      usage: deps.usage,
      reconnect: deps.reconnect,
      usageLimit: deps.usageLimit,
    });
  }

  /** 作業中の様子（チャットの詳細の live。SSE の chat_live と同じ形） */
  live(chatId: number): ChatLive {
    return this.runtimes.live(chatId);
  }

  /** つながったら自動で再開するのをやめる（待っていなければ 409） */
  stopReconnect(chatId: number): void {
    if (!this.recovery.stopWaiting(chatId)) throw new Conflict("つながるのを待っていません");
  }

  async start(input: StartChatInput): Promise<Chat> {
    const { chat, prompt, messageUuid } = await createChat(this.deps, input);
    void this.execute({ chatId: chat.id, prompt, promptId: messageUuid });
    return this.deps.store.chats.get(chat.id)!;
  }

  /**
   * 終了した会話に追加の指示を送り、続きから再開する（pauseAfter なら、この作業が終わったら送信待ちを一時停止する。
   * postCompact なら圧縮後指示として、記録に札を付け、AI には前置きを付けて送る）
   */
  async send(chatId: number, text: string, options: ChatOptionsPatch = {}, attachments: Attachment[] = [], { pauseAfter = false, postCompact = false }: SendOpts = {}): Promise<Chat> {
    const chat = this.requireChat(chatId);
    this.requireIdle(chatId, "送信");
    const { store } = this.deps;
    // 動かし始めるまで作業中として数える（組み立ての間に届いた送信は、作業中のチャットへの送信として扱われる）
    const runtime = this.runtimes.get(chatId);
    runtime.preparing = true;
    let prepared: Awaited<ReturnType<typeof followupPrompt>>;
    try {
      prepared = await followupPrompt(this.deps, chatId, postCompact ? postCompactMessage(text) : text, attachments);
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
    store.events.add(chat.id, { type: "user", text, ...(attachments.length ? { attachments } : {}), ...handover, ...postCompactMark(postCompact), message_uuid: messageUuid });
    // チャット欄でモデルや権限モードを変えた場合は、この続きから反映する
    store.chats.update(chat.id, {
      status: "running",
      error: null,
      unread: false,
      ...options,
    });
    // 動かし始めたら作業中（runtime.turn）として数えられるので、準備の印は外す
    runtime.preparing = false;
    // 質問として送った: 動かし始める前に印を付ける（すぐ終わる作業でも、終わりの自動送信より先に付いている）
    if (pauseAfter) this.pauseAfterTurn(chatId);
    void this.execute({ chatId: chat.id, prompt, promptId: messageUuid });
    return store.chats.get(chat.id)!;
  }

  /**
   * 止めずに伝える: 作業中なら、いまのやり取りに発言を足す（メインエージェントが、いまの手順の切れ目で読む。
   * 裏のサブエージェント・コマンドは動き続ける）。圧縮中・圧縮前指示から圧縮が終わるまでなら預かり、圧縮が終わったら伝える（deliverAfterCompact）。
   * 足せないとき（始まる前など）は待ちの列に入れ（at があればその位置）、作業中でなければすぐ送る。
   * pauseAfter（質問として送る）なら、伝えた・預かったときはいまの作業が終わったら、列に入れたときはその指示のあとで一時停止する。
   * モデルなどの選択は、作業の途中では変えられないので次に送るときから効く
   */
  async tell(
    chatId: number,
    text: string,
    options: ChatOptionsPatch = {},
    attachments: Attachment[] = [],
    { at, pauseAfter = false, postCompact = false, draining = false }: SendOpts & { at?: number; draining?: boolean } = {},
  ): Promise<TellResult["result"]> {
    const { store } = this.deps;
    const chat = this.requireChat(chatId);
    if (!this.isBusy(chatId)) {
      await this.send(chatId, text, options, attachments, { pauseAfter, postCompact });
      return "sent";
    }
    const runtime = this.runtimes.get(chatId);
    const hold = (): "held" => {
      if (pauseAfter) this.pauseAfterTurn(chatId);
      return this.holdUntilCompacted(runtime, text, options, attachments, postCompact);
    };
    // 預かった指示を送っている途中（draining）のものは、預かり直さない
    if (runtime.holdsTells && !draining) return hold();
    const { prompt, handover } = await followupPrompt(this.deps, chatId, postCompact ? postCompactMessage(text) : text, attachments);
    const messageUuid = randomUUID();
    // 組み立てている間に圧縮が始まったら、預かる（届いた報告の添え書きは、伝えるときに組み立て直す）
    if (runtime.holdsTells && !(draining && !runtime.compacting && !runtime.awaitingCompact)) return hold();
    // 組み立てている間に始まった・終わった実行もあるので、足し先は組み立てたあとに取り直す
    if (runtime.control?.tell(prompt, messageUuid)) {
      // 自分で送った: つながったら再開する・再開するかを聞くのをやめる
      this.forgetRecovery(chatId);
      store.events.add(chatId, { type: "user", text, ...(attachments.length ? { attachments } : {}), ...handover, ...postCompactMark(postCompact), message_uuid: messageUuid });
      if (chat.unread) store.chats.setUnread(chatId, false);
      if (pauseAfter) this.pauseAfterTurn(chatId);
      return "told";
    }
    const { id } = runtime.queue.add(text, options, attachments, { postCompact });
    if (at !== undefined) runtime.queue.move(id, at);
    if (pauseAfter) runtime.queue.setStopAfter(id);
    // 組み立てている間に作業が終わっていたら、終わったときの自動送信はもう済んでいるので、ここで送る（列に取り残さない）
    if (!this.isBusy(chatId)) void this.sendNextQueued(chatId);
    return "queued";
  }

  /**
   * 圧縮中・圧縮前指示から圧縮が終わるまでの「いま」を預かる（ChatLive の after_compact。流れの終わりに「圧縮が終わったら伝えます」と出す）。
   * この間に足すと、圧縮前指示の作業に混ざり、画面では圧縮より上に出て、要約したあとの会話に入ったかも分からないため、圧縮が終わってから伝える
   */
  private holdUntilCompacted(runtime: ChatRuntime, text: string, options: ChatOptionsPatch, attachments: Attachment[], postCompact: boolean): "held" {
    const message: QueuedMessage = { id: randomUUID(), text, options, attachments, created_at: new Date().toISOString(), ...(postCompact ? { post_compact: true } : {}) };
    runtime.update({ afterCompact: [...runtime.afterCompact, message] });
    return "held";
  }

  /**
   * 圧縮が終わったら、預かった「いま」を送った順にいまのやり取りへ伝える（圧縮後指示があれば、先頭に置いてあるので最初に伝える）。
   * いまのやり取りに足せない（手で圧縮する実行・作業ごと終わった）ときは、実行の終わり（execute）で送る（deliverHeld）
   */
  private deliverAfterCompact(chatId: number) {
    const runtime = this.runtimes.get(chatId);
    if (runtime.afterCompact.length === 0 || !runtime.control) return;
    this.drainAfterCompact(chatId, false);
  }

  /**
   * 実行が終わったときに残っている預かった「いま」を送る: 1 件目（圧縮後指示があればそれ）をすぐ送り、残りはその作業に伝える（送信待ちを止めていても送る。
   * 作業していないときの「いま」と同じ）。送れない終わり方（通信の切断・使用枠の上限・アプリの終了）なら、送信待ちの先頭に入れる
   */
  private deliverHeld(chatId: number, sendNow: boolean) {
    const runtime = this.runtimes.get(chatId);
    const held = runtime.afterCompact;
    // 送っている途中なら、その続きに任せる（残りを送ると、その作業の終わりで送信待ちの次へ進む）
    if (held.length === 0 || runtime.deliveringAfterCompact) return;
    if (!sendNow) {
      runtime.update({ afterCompact: [] });
      held.forEach((m, i) => runtime.queue.move(runtime.queue.add(m.text, m.options, m.attachments, { postCompact: m.post_compact }).id, i));
      return;
    }
    this.drainAfterCompact(chatId, true);
  }

  /**
   * 預かった「いま」を先頭から 1 件ずつ送る（sendFirst なら 1 件目は新しい作業として送り、残りはその作業に伝える）。
   * 送り終えるまでは「いま」を預かったままにし（deliveringAfterCompact）、その間に来た指示も列の後ろに足して続けて送る
   * （圧縮後指示・前に預かった指示より先に、あとから送った指示が入らないように）
   */
  private drainAfterCompact(chatId: number, sendFirst: boolean) {
    const runtime = this.runtimes.get(chatId);
    runtime.update({ deliveringAfterCompact: true });
    void (async () => {
      try {
        for (let i = 0; ; i++) {
          const [m, ...rest] = runtime.afterCompact;
          if (!m) break;
          runtime.update({ afterCompact: rest });
          try {
            if (i === 0 && sendFirst) {
              await this.send(chatId, m.text, m.options, m.attachments, { postCompact: m.post_compact });
              // 残りはその作業に伝えるので、足し先（作業中の操作）ができるまで待つ（先に伝えると、足せずに送信待ちへ回る）
              await untilTellable(runtime);
            } else await this.tell(chatId, m.text, m.options, m.attachments, { at: sendFirst ? i - 1 : i, postCompact: m.post_compact, draining: true });
          } catch (e) {
            this.reportError(chatId, `圧縮のあとに指示を${i === 0 && sendFirst ? "送れません" : "伝えられません"}でした: ${errorMessage(e)}`);
          }
        }
      } finally {
        runtime.update({ deliveringAfterCompact: false });
      }
    })();
  }

  /** 裏で動いている作業を 1 つ止める（サブエージェント・コマンド。作業中でなければ 409） */
  async stopBackgroundTask(chatId: number, taskId: string): Promise<void> {
    const control = this.runtimes.get(chatId).control;
    if (!control) throw new Conflict("このチャットは作業中ではありません");
    await control.stopTask(taskId);
  }

  /** チャットを消したとき: 作業中の状態（送信待ちの列も）を捨て、再開の段取りもやめる */
  forget(chatId: number) {
    this.forgetRecovery(chatId);
    this.runtimes.forget(chatId);
  }

  /** 自分で送った・チャットを消した: 通信・使用枠の上限で止まったあとの再開の段取り（待つ・聞く）をやめる（再開の段取りが送ったものなら続ける） */
  private forgetRecovery(chatId: number) {
    this.recovery.forget(chatId);
  }

  /**
   * 会話を要約して、コンテキストを空ける（Claude Code の /compact を手で実行する）。
   * 会話の記録には発言として残さず、要約したこと（compact イベント）だけが残る。終わっても未読にしない。
   * 作業中なら予約する: 送信待ちのいちばん上に圧縮の行を入れ、いまのやり取りが終わったらすぐ圧縮を始める（行を消せばやめられる）。
   * 圧縮前指示（設定・プロジェクト）があれば、先にその指示を送り（札付きの自分の発言として残る）、その作業が最後まで終わってから圧縮する
   */
  async compact(chatId: number): Promise<Chat> {
    const { store } = this.deps;
    const chat = this.requireChat(chatId);
    const runtime = this.runtimes.get(chatId);
    if (this.isBusy(chatId)) {
      runtime.queue.reserve("compact");
      return chat;
    }
    if (!chat.session_id) throw new Conflict("まだ会話がないので、圧縮できません");
    store.chats.update(chat.id, { status: "running", error: null });
    const text = preCompactPromptOf(store, store.projects.get(chat.project_id)!);
    if (!text) {
      void this.execute({ chatId: chat.id, prompt: "/compact", compact: true });
      return store.chats.get(chat.id)!;
    }
    const messageUuid = randomUUID();
    store.events.add(chat.id, { type: "user", text, pre_compact: true, message_uuid: messageUuid });
    // この指示の作業の途中で自動の圧縮が来ても、もう足さない。圧縮が終わるまで「いま」は預かる
    runtime.preCompactSent = true;
    runtime.update({ awaitingCompact: true });
    void this.execute({ chatId: chat.id, prompt: manualPreCompactMessage(text), promptId: messageUuid, thenCompact: true });
    return store.chats.get(chat.id)!;
  }

  /** 圧縮前指示のあとに圧縮する（終わったら、その終わりで預かった「いま」・送信待ちの次を送る） */
  private compactNow(chatId: number, trigger: CompactTrigger) {
    this.deps.store.chats.update(chatId, { status: "running", error: null });
    void this.execute({ chatId, prompt: "/compact", compact: true, compactTrigger: trigger });
  }

  /**
   * コンテキストを消去する（送信待ちのコンテキスト消去の行）: チャットのセッションを外し、次の指示から新しい会話で始める。
   * 会話の記録は残し、消去したこと（context_cleared イベント）を残す。作業中なら 409、まだ会話がなければ 409
   */
  clearContext(chatId: number): Chat {
    const { store } = this.deps;
    const chat = this.requireChat(chatId);
    this.requireIdle(chatId, "コンテキストの消去");
    if (!chat.session_id) throw new Conflict("まだ会話がないので、消去するコンテキストがありません");
    // 自分で頼んだ: 止まったあとの再開の段取り（前の会話の続きを頼むもの）をやめる
    this.forgetRecovery(chatId);
    // コンテキストの大きさは、次の応答まで分からない
    const cleared = store.chats.update(chat.id, { session_id: null, context_tokens: null });
    // 新しい会話: 次に上限に近づいたら、また圧縮前指示を送る
    const runtime = this.runtimes.get(chatId);
    runtime.preCompactSent = false;
    runtime.update({ awaitingCompact: false });
    store.events.add(chat.id, { type: "context_cleared" });
    return cleared;
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

  /** チャット（なければ 404） */
  protected requireChat(chatId: number): Chat {
    const chat = this.deps.store.chats.get(chatId);
    if (!chat) throw new NotFound("チャットが見つかりません");
    return chat;
  }

  protected reportError(chatId: number, message: string) {
    this.deps.store.events.add(chatId, { type: "error", message });
  }

  isBusy(chatId: number): boolean {
    return this.runtimes.isBusy(chatId);
  }

  /** 作業中（送る準備の途中も）なら 409。action は「削除」「分岐」などの、できない操作の名前 */
  requireIdle(chatId: number, action: string): void {
    if (this.isBusy(chatId)) throw new Conflict(`作業中のチャットは${action}できません。終わってから（または中断してから）行ってください`);
  }

  /** アプリ終了時: 実行中のエージェントをすべて止める */
  shutdown() {
    this.shuttingDown = true;
    this.recovery.shutdown();
    for (const runtime of this.runtimes.running()) runtime.turn?.abort();
  }

  /** 送った指示をすぐ動かす（同時に動かす数は決めない） */
  private async execute(item: TurnRequest) {
    const runtime = this.runtimes.get(item.chatId);
    const controller = new AbortController();
    runtime.turn = controller;
    // 手で圧縮する実行の間は、圧縮が始まる前・終わったあとも「いま」を預かる（実行の終わりで送る）
    if (item.compact) runtime.update({ awaitingCompact: true });
    let outcome: TurnOutcome = { status: "failed", network: false };
    try {
      outcome = await executeTurn(this.deps, runtime, item, controller.signal);
    } finally {
      runtime.turn = null;
      // 通信が切れた・使用枠の上限で止まったときは送らず、つながる・枠が戻るのを待つ（送っても失敗して消えるため。アプリを終えるときも送らない）
      const finished = this.recovery.finished(item.chatId, outcome) && !this.shuttingDown;
      // 圧縮前指示の作業が最後まで終わって、まだ圧縮していなければ、続けて圧縮する（手で頼んだ圧縮の前の指示 = thenCompact、
      // 自動の圧縮の前の指示で、作業の区切りまで圧縮が来なかったもの = awaitingCompact。次の指示を送ると、その初めに圧縮されて、指示が圧縮より上に出るため）。
      // 止めた・失敗したときは圧縮しない
      const compactNext = finished && outcome.status === "completed" && !item.compact && (Boolean(item.thenCompact) || runtime.awaitingCompact);
      // 止めるよう頼んでいたら、終わったので停止中を消す。続けて圧縮しないなら、「いま」を預かる間も終わる
      runtime.update({ stopping: false, ...(compactNext ? {} : { awaitingCompact: false }) });
      void this.deps.usage.refresh();
      if (compactNext) {
        this.compactNow(item.chatId, item.thenCompact ? "manual" : "auto");
      } else if (runtime.afterCompact.length > 0) {
        // 圧縮が終わるまで預かった「いま」を、送信待ちより先に送る
        this.deliverHeld(item.chatId, finished);
      } else if (finished) {
        // 終わったら、待ちの列の次の指示を送る（完了でも、止めた・失敗したときでも送る）。
        // 次が圧縮の行（作業中に予約した圧縮も）なら圧縮し、圧縮が終わったら、その終わりで送信待ちの次を送る
        void this.sendNextQueued(item.chatId);
      }
    }
  }
}

/** 圧縮後指示として送った発言の記録の印（ほかの発言には付けない） */
function postCompactMark(postCompact: boolean): { post_compact?: true } {
  return postCompact ? { post_compact: true } : {};
}

/** 動かし始めた作業に発言を足せるようになる（作業中の操作ができる）か、作業が終わるまで待つ */
async function untilTellable(runtime: ChatRuntime) {
  while (!runtime.control && runtime.busy) await new Promise((resolve) => setTimeout(resolve, 20));
}

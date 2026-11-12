import { randomUUID } from "node:crypto";
import { executeTurn, type ExecutionDeps, type TurnRequest, type TurnOutcome } from "./turn.js";
import { RunnerQueue, type SendOpts } from "./runnerQueue.js";
import { ChatRuntimes, type ChatRuntime } from "./runtime.js";
import { ChatRecovery } from "./recovery/recovery.js";
import { createChat, followupPrompt, nameOnFirstMessage, type StartChatInput } from "./input.js";
import { startChildChat } from "./children.js";
import { type Attachment, type Chat, type ChatLive, type ChatOptionsPatch, type CompactTrigger, type QueuedMessage, type QueueResume, type QueueResumeAction, type TellResult, type MessageMarks } from "@shared/types";
import { resumeMomentsOf } from "./queueResume.js";
import type { UsageMonitor } from "../usage/planUsage.js";
import { Conflict, Invalid, NotFound } from "../http/errors.js";
import { errorMessage } from "@shared/errors";
import { busyPreCompactMessage, manualPreCompactMessage, postCompactMessage, RESTART_RESUME_PROMPT } from "@shared/chat/prompts";
import { postCompactItem, preCompactPromptOf } from "./preCompact.js";
import { isClearCommand } from "@shared/chat/queueActions";
import { marksOf } from "@shared/chat/handoff";

/**
 * エージェントの実行を管理する。
 * 送った指示はすぐ動かす（同時に動かす数は決めない）。
 * 1 つのチャットは 1 つの会話で、追加のメッセージを送ると同じセッションを続きから再開する。
 * チャットごとの作業中の状態（動かしている実行・送信待ちの列・裏の作業・再試行・圧縮中・停止中）は runtime.ts の ChatRuntime に 1 つずつ持ち、
 * 変わったらまとめて画面に配る（SSE の chat_live）。作業中のチャットに送った次の指示は送信待ちの列に入れ、作業が終わったら（止めた・失敗したときも）順に送る。
 * 1 回の実行の中身（作業場所・プロバイダーの呼び出し・結果の反映）は turn.ts、
 * 通信の切断・使用枠の上限で止まったときの再開の段取り（送信待ちを止める・待つ・聞く・再開する）は recovery/
 */
/** 起動したときの送信待ちの確かめで、止まったところを探す記録の数（新しいほうから） */
const RESUME_EVENTS = 300;

export class Runner extends RunnerQueue {
  protected readonly runtimes: ChatRuntimes;
  /** アプリを終えるところ（待ちの列を送らない） */
  private shuttingDown = false;

  /** 通信の切断・使用枠の上限で止まったあとの再開の段取り */
  private readonly recovery: ChatRecovery;

  /** 1 回の実行に渡すもの（AI が自分の子チャットを作るツールのために、子チャットの作り方を足す） */
  private readonly turnDeps: ExecutionDeps;


  constructor(
    private readonly deps: ExecutionDeps & {
      usage: UsageMonitor;
      /** つながったかの確かめ方と間隔（テストで差し替える） */
      reconnect?: { check?: () => Promise<boolean>; intervalMs?: number };
      /** 使用枠が戻ったかを確かめる時計と間隔（テストで差し替える） */
      usageLimit?: { now?: () => number; checkMs?: number };
      /** 書き直している印の持ち時間（テストで差し替える） */
      editHoldTtlMs?: number;
      /** 前回の終了で作業の途中で止まったチャット（起動したときの確かめで「中断した作業を続けてから送る」を選べる） */
      interrupted?: number[];
    },
  ) {
    super();
    this.turnDeps = { ...deps, startChildChat: (parent, input) => startChildChat({ store: deps.store, runner: this, providers: deps.providers }, parent, input) };
    // 再起動しても送信待ちの列は残す（読み戻した列は止めておく）
    this.runtimes = new ChatRuntimes({
      store: deps.store,
      bus: deps.bus,
      editTtlMs: deps.editHoldTtlMs,
      onEditsChanged: (chatId) => this.editsChanged(chatId),
      onAfterCompactEditsChanged: (chatId) => this.afterCompactEditsChanged(chatId),
      onCompactEnded: (chatId) => this.deliverAfterCompact(chatId),
    });
    // 自動で送るまま送信待ちが残ったチャットは、起動しただけでは送らず、利用者に聞く（queueResumes / resolveQueueResumes）
    const interrupted = new Set(deps.interrupted ?? []);
    for (const saved of deps.store.queues.list()) {
      if (this.waitsForResume(saved.chatId)) this.runtimes.get(saved.chatId).update({ resume: { interrupted: interrupted.has(saved.chatId) } });
    }
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

  /** 起動すると送り始める送信待ちか（指示があり、自動で送るで、先頭の上に一時停止の線がなく、作業していない） */
  private waitsForResume(chatId: number): boolean {
    const { queue } = this.runtimes.get(chatId);
    return queue.list().length > 0 && !queue.isPaused() && !queue.stopsAtHead() && !this.isBusy(chatId);
  }

  /**
   * 起動したときの送信待ちの確かめ: 前回の終了で、自動で送るまま送信待ちが残ったチャット（答えるまで送らない）。
   * 選ぶ前に中身を見られるよう、送信待ちのすべてと、止まったところを添える。送信待ちが空になったものは外す
   */
  queueResumes(): QueueResume[] {
    const out: QueueResume[] = [];
    for (const { chatId } of this.deps.store.queues.list()) {
      const runtime = this.runtimes.get(chatId);
      const chat = this.deps.store.chats.get(chatId);
      if (!runtime.resume || !chat) continue;
      const { messages, stops } = runtime.queue.snapshot();
      if (messages.length === 0) {
        runtime.update({ resume: null });
        continue;
      }
      out.push({
        chat_id: chatId,
        project_id: chat.project_id,
        title: chat.title,
        interrupted: runtime.resume.interrupted,
        messages,
        stops,
        ...resumeMomentsOf(this.deps.store.events.recent(chatId, RESUME_EVENTS)),
      });
    }
    return out;
  }

  /**
   * 起動したときの送信待ちの確かめに答える（チャットごと。答えなかったチャットは待ったまま）。送る: 自動で送るのまま先頭を送る /
   * 続けてから送る: 中断した作業を続けるよう頼み、その作業が終わってから送信待ちを送る（中断していなければ、送ると同じ）/ 止めておく: 止めています にする。
   * 自分で送って作業中なら、送るも続けてから送るも、その作業が終わってから送信待ちを送る。確かめを待っていないチャットは飛ばす
   */
  async resolveQueueResumes(decisions: { chatId: number; action: QueueResumeAction }[]): Promise<void> {
    for (const { chatId, action } of decisions) {
      const runtime = this.runtimes.get(chatId);
      const resume = runtime.resume;
      if (!resume) continue;
      runtime.update({ resume: null });
      if (action === "pause") {
        runtime.queue.setPaused(true);
      } else if (this.isBusy(chatId)) {
        continue;
      } else if (action === "continue" && resume.interrupted) {
        await this.send(chatId, RESTART_RESUME_PROMPT);
      } else {
        await this.sendNextQueued(chatId);
      }
    }
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
  async send(chatId: number, text: string, options: ChatOptionsPatch = {}, attachments: Attachment[] = [], { pauseAfter = false, postCompact = false, marks = {} }: SendOpts = {}): Promise<Chat> {
    const chat = this.requireChat(chatId);
    this.requireIdle(chatId, "送信");
    // チャット欄の /clear: Claude Code に送らず、送信待ちのコンテキスト消去と同じく Kickoff がセッションを外して区切りを残す
    if (!postCompact && isClearCommand(text, attachments)) return this.clearByCommand(chatId);
    const { store } = this.deps;
    const runtime = this.runtimes.get(chatId);
    // 動かし始めるまで作業中として数える（組み立ての間に届いた送信は、作業中のチャットへの送信として扱われる）
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
    // 聞かずに開いた子チャット（名前も発言もない）は、最初に送った文から名前を付ける
    if (!postCompact) nameOnFirstMessage(this.deps, chat.id, text, attachments);
    store.events.add(chat.id, { type: "user", text, ...(attachments.length ? { attachments } : {}), ...handover, ...postCompactMark(postCompact), ...marks, message_uuid: messageUuid });
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
    // 前の作業が送れない終わり方をして残った圧縮後指示があれば、この作業にそのまま伝える（送信待ちには入れない）
    if (!postCompact && runtime.afterCompact.length > 0 && !runtime.deliveringAfterCompact) this.drainAfterCompact(chatId, false);
    return store.chats.get(chat.id)!;
  }

  /**
   * 止めずに伝える: 作業中なら、いまのやり取りに発言を足す（メインエージェントが、いまの手順の切れ目で読む。
   * 裏のサブエージェント・コマンドは動き続ける）。圧縮前指示から圧縮後指示のやり取りが終わるまで（どちらもなければ、圧縮からそのあとのやり取りが終わるまで。
   * holdsTells）なら預かり、そのやり取りが終わってから送る（deliverHeld。圧縮後指示だけは、圧縮が終わったらいまのやり取りに伝える = deliverAfterCompact）。
   * 足せないとき（始まる前など）は待ちの列に入れ（at があればその位置）、作業中でなければすぐ送る。
   * pauseAfter（質問として送る）なら、伝えた・預かったときはいまの作業が終わったら、列に入れたときはその指示のあとで一時停止する。
   * モデルなどの選択は、作業の途中では変えられないので次に送るときから効く
   */
  async tell(
    chatId: number,
    text: string,
    options: ChatOptionsPatch = {},
    attachments: Attachment[] = [],
    { at, pauseAfter = false, postCompact = false, draining = false, marks = {} }: SendOpts & { at?: number; draining?: boolean } = {},
  ): Promise<TellResult["result"]> {
    const { store } = this.deps;
    const chat = this.requireChat(chatId);
    if (!this.isBusy(chatId)) {
      await this.send(chatId, text, options, attachments, { pauseAfter, postCompact, marks });
      return "sent";
    }
    const runtime = this.runtimes.get(chatId);
    // 作業中の /clear: いまのやり取りには足せない（足すと作業の途中で会話が空になる）ので、終わったらすぐ消去する予約にする
    // （送信待ちのいちばん上に消去の行。作業中の行の「すぐ送る」と同じ）
    if (!postCompact && isClearCommand(text, attachments)) {
      runtime.queue.reserve("clear");
      return "queued";
    }
    const hold = (): "held" => {
      if (pauseAfter) this.pauseAfterTurn(chatId);
      return this.holdUntilCompacted(runtime, text, options, attachments, postCompact, marks);
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
      store.events.add(chatId, { type: "user", text, ...(attachments.length ? { attachments } : {}), ...handover, ...postCompactMark(postCompact), ...marks, message_uuid: messageUuid });
      if (chat.unread) store.chats.setUnread(chatId, false);
      if (pauseAfter) this.pauseAfterTurn(chatId);
      return "told";
    }
    if (postCompact) {
      // 圧縮後指示は送信待ちに入れない: 預かりの先頭に戻し、作業の終わりに送信待ちより先に送る（もう終わっていれば、いま送る）
      runtime.update({ afterCompact: [postCompactItem(text), ...runtime.afterCompact] });
      if (!this.isBusy(chatId)) this.deliverHeld(chatId, true);
      return "held";
    }
    const { id } = runtime.queue.add(text, options, attachments, marks);
    if (at !== undefined) runtime.queue.move(id, at);
    if (pauseAfter) runtime.queue.setStopAfter(id);
    // 組み立てている間に作業が終わっていたら、終わったときの自動送信はもう済んでいるので、ここで送る（列に取り残さない）
    if (!this.isBusy(chatId)) void this.sendNextQueued(chatId);
    return "queued";
  }

  /**
   * 圧縮が終わるまで預かった指示（「いま」と圧縮後指示）を、送らずに外す（圧縮中に誤って送ったとき）。外した指示を返す。
   * 預かりにない（もう伝えた）なら 404、圧縮のあとで順に伝えている途中なら 409（先頭から取り出しているので、外すと別の指示を飛ばしうる）
   */
  removeAfterCompact(chatId: number, messageId: string): QueuedMessage {
    const runtime = this.runtimes.get(chatId);
    const message = runtime.afterCompact.find((m) => m.id === messageId);
    if (!message) throw new NotFound("その指示は、もう伝えたか見つかりません");
    if (runtime.deliveringAfterCompact) throw new Conflict("圧縮のあとで順に伝えている途中です。少し待ってからやり直してください");
    runtime.update({ afterCompact: runtime.afterCompact.filter((m) => m.id !== messageId) });
    return message;
  }

  /**
   * 預かった指示をその場で書き直す（送る順はそのまま）。書き直し中の印も外し、送る順が来ていれば送る（afterCompactEditsChanged）。
   * 預かりにない（もう伝えた）なら 404、書き直し中の印がないまま順に伝えている途中なら 409、圧縮後指示・文も添付もなくなるなら 400
   */
  updateAfterCompact(chatId: number, messageId: string, text: string, attachments: Attachment[]): QueuedMessage {
    const runtime = this.runtimes.get(chatId);
    const message = runtime.afterCompact.find((m) => m.id === messageId);
    if (!message) throw new NotFound("その指示は、もう伝えたか見つかりません");
    if (message.post_compact) throw new Invalid("圧縮後指示は書き直せません（設定の圧縮後指示を直してください）");
    if (!text.trim() && attachments.length === 0) throw new Invalid("メッセージか添付ファイルが必要です");
    if (runtime.deliveringAfterCompact && !runtime.afterCompactEdits.has(messageId)) throw new Conflict("圧縮のあとで順に伝えている途中です。少し待ってからやり直してください");
    const next: QueuedMessage = { ...message, text: text.trim(), attachments };
    runtime.update({ afterCompact: runtime.afterCompact.map((m) => (m.id === messageId ? next : m)) });
    runtime.afterCompactEdits.set([]);
    return next;
  }

  /**
   * 画面で書き直している預かった指示を丸ごと置き換える（空なら外す）。書き直している間は、送る順が来てもその指示から後ろを送らずに待つ。
   * 開いている間、画面は持ち時間（EDIT_HOLD_TTL_MS）より短い間隔で知らせ直す（途絶えたら外れて送る。預かりにない指示は数えない）
   */
  setAfterCompactEditing(chatId: number, ids: string[]) {
    const runtime = this.runtimes.get(chatId);
    runtime.afterCompactEdits.set(ids.filter((id) => runtime.afterCompact.some((m) => m.id === id && !m.post_compact)));
  }

  /**
   * 書き直している預かった指示が変わった・外れた: 書き直しを待って止めていた分を送る。作業していなければ 1 件目から新しい作業として
   * （作業の終わりの deliverHeld と同じ）、作業中で預かる間でなければ、いまの作業に伝える。圧縮中などは、そのやり取りの終わりに送る
   */
  private afterCompactEditsChanged(chatId: number) {
    const runtime = this.runtimes.get(chatId);
    const head = runtime.afterCompact[0];
    if (!head || runtime.deliveringAfterCompact || runtime.editingAfterCompact) return;
    if (!this.isBusy(chatId)) {
      // 作業していないのに残っている圧縮後指示（次に送る指示と一緒に伝えるもの）は、ここでは送らない
      if (!head.post_compact) this.deliverHeld(chatId, true);
    } else if (!runtime.holdsTells) this.drainAfterCompact(chatId, false);
  }

  /**
   * 圧縮前指示から圧縮後指示のやり取りが終わるまでの「いま」を預かる（ChatLive の after_compact。流れの終わりに「このやり取りが終わったら送ります」と出す）。
   * この間に足すと、圧縮前指示の作業・圧縮後指示のやり取りに混ざり、画面では圧縮より上に出て、要約したあとの会話に入ったかも分からないため、そのやり取りが終わってから送る
   */
  private holdUntilCompacted(runtime: ChatRuntime, text: string, options: ChatOptionsPatch, attachments: Attachment[], postCompact: boolean, marks: MessageMarks = {}): "held" {
    const message: QueuedMessage = { id: randomUUID(), text, options, attachments, created_at: new Date().toISOString(), ...(postCompact ? { post_compact: true } : {}), ...marks };
    runtime.update({ afterCompact: [...runtime.afterCompact, message] });
    return "held";
  }

  /**
   * 圧縮が終わったら、圧縮後指示をいまのやり取りへ伝える（先頭に置いてある。自分の「いま」は、このやり取りが終わってから deliverHeld で送る）。
   * いまのやり取りに足せない（手で圧縮する実行・作業ごと終わった）ときは、実行の終わり（execute）で送る（deliverHeld）
   */
  private deliverAfterCompact(chatId: number) {
    const runtime = this.runtimes.get(chatId);
    if (runtime.afterCompact.length === 0 || !runtime.control) return;
    this.drainAfterCompact(chatId, false);
  }

  /**
   * 実行が終わったときに残っている預かった「いま」を送る: 1 件目をすぐ送り、残りはその作業に伝える（送信待ちを止めていても、送信待ちより先に送る。
   * 作業していないときの「いま」と同じ）。1 件目が圧縮後指示なら、それだけを送り、自分の指示はその作業が終わってから送る（圧縮後指示のやり取りに混ぜない）。
   * 送れない終わり方（通信の切断・使用枠の上限・アプリの終了）なら、送信待ちの先頭に入れる
   */
  private deliverHeld(chatId: number, sendNow: boolean) {
    const runtime = this.runtimes.get(chatId);
    const held = runtime.afterCompact;
    if (held.length === 0) return;
    // 送っている途中なら、その続きに任せる（残りを送ると、その作業の終わりで送信待ちの次へ進む）。送れない終わり方なら、送るのをやめてもらう
    if (runtime.deliveringAfterCompact) {
      if (!sendNow) runtime.parkAfterCompact = true;
      return;
    }
    if (!sendNow) this.parkAfterCompact(runtime);
    else this.drainAfterCompact(chatId, true);
  }

  /**
   * 送れない終わり方（通信の切断・使用枠の上限・アプリの終了）のときに、預かった指示を置いておく: 自分の指示は送信待ちの先頭へ。
   * 圧縮後指示は送信待ちに入れずに預かりに残し、次に送った作業にそのまま伝える（send）
   */
  private parkAfterCompact(runtime: ChatRuntime) {
    const held = runtime.afterCompact;
    runtime.parkAfterCompact = false;
    runtime.update({ afterCompact: held.filter((m) => m.post_compact) });
    held.filter((m) => !m.post_compact).forEach((m, i) => runtime.queue.move(runtime.queue.add(m.text, m.options, m.attachments, marksOf(m)).id, i));
  }

  /**
   * 預かった「いま」を先頭から 1 件ずつ送る（sendFirst なら 1 件目は新しい作業として送り、残りはその作業に伝える）。
   * 送り終えるまでは「いま」を預かったままにし（deliveringAfterCompact）、その間に来た指示も列の後ろに足して続けて送る
   * （圧縮後指示・前に預かった指示より先に、あとから送った指示が入らないように）。
   * 圧縮したやり取りの途中（compactedTurn。圧縮後指示を伝えた・新しい作業として送った作業も）は、自分の指示を伝えずに止め、そのやり取りが終わってから送る
   */
  private drainAfterCompact(chatId: number, sendFirst: boolean) {
    const runtime = this.runtimes.get(chatId);
    runtime.parkAfterCompact = false;
    runtime.update({ deliveringAfterCompact: true });
    void (async () => {
      try {
        for (let i = 0; ; i++) {
          const m = runtime.afterCompact[0];
          if (!m || runtime.parkAfterCompact) break;
          // 画面で書き直している指示に来たら、そこで止める（書き直しが終わったら afterCompactEditsChanged で続きを送る。順番を入れ替えない）
          if (runtime.afterCompactEdits.has(m.id)) break;
          const sendNow = i === 0 && sendFirst;
          // 圧縮したやり取り（圧縮後指示のやり取り）の途中は、自分の指示を足さない（そのやり取りが終わったら deliverHeld で送る）
          if (!sendNow && !m.post_compact && runtime.compactedTurn) break;
          try {
            if (m.post_compact && !sendNow) {
              await this.tellPostCompact(chatId, m);
            } else {
              runtime.update({ afterCompact: runtime.afterCompact.slice(1) });
              if (sendNow) {
                // 圧縮後指示の作業は、終わるまで「いま」を預かる（作業の終わりで外れる。送れなければ外す）
                if (m.post_compact) runtime.update({ compactedTurn: true });
                await this.send(chatId, m.text, m.options, m.attachments, { postCompact: m.post_compact, marks: marksOf(m) }).catch((e: unknown) => {
                  if (!this.isBusy(chatId)) runtime.update({ compactedTurn: false });
                  throw e;
                });
                // 残りはその作業に伝えるので、足し先（作業中の操作）ができるまで待つ（先に伝えると、足せずに送信待ちへ回る）
                await untilTellable(runtime);
              } else await this.tell(chatId, m.text, m.options, m.attachments, { at: sendFirst ? i - 1 : i, draining: true, marks: marksOf(m) });
            }
          } catch (e) {
            if (runtime.afterCompact[0] === m) runtime.update({ afterCompact: runtime.afterCompact.slice(1) });
            this.reportError(chatId, `圧縮のあとに指示を${sendNow ? "送れません" : "伝えられません"}でした: ${errorMessage(e)}`);
          }
        }
      } finally {
        runtime.update({ deliveringAfterCompact: false });
        // 送っている途中で、作業が送れない終わり方をした: 残りを置いておく
        if (runtime.parkAfterCompact) {
          this.parkAfterCompact(runtime);
          // 置くまでの間に次の作業を送っていれば（send は送っている途中なので、こちらに任せて伝えなかった）、残した圧縮後指示をその作業に伝える
          if (runtime.busy && runtime.afterCompact.length > 0) this.drainAfterCompact(chatId, false);
        }
      }
    })();
  }

  /**
   * 圧縮後指示を、送信待ちに入れずにメインエージェントへ伝える: いまのやり取りに足せるまで待って足し、作業がもう終わっていれば新しい作業として送る
   * （送るまで預かりの先頭に置いたままにするので、作業の終わりに送信待ちの次へ進まない）
   */
  private async tellPostCompact(chatId: number, m: QueuedMessage) {
    const { store } = this.deps;
    const runtime = this.runtimes.get(chatId);
    const { prompt, handover } = await followupPrompt(this.deps, chatId, postCompactMessage(m.text), m.attachments);
    for (;;) {
      if (runtime.parkAfterCompact) return;
      if (!this.isBusy(chatId)) {
        // 圧縮後指示の作業は、終わるまで「いま」を預かる（作業の終わりで外れる）
        runtime.update({ afterCompact: runtime.afterCompact.slice(1), compactedTurn: true });
        await this.send(chatId, m.text, m.options, m.attachments, { postCompact: true }).catch((e: unknown) => {
          if (!this.isBusy(chatId)) runtime.update({ compactedTurn: false });
          throw e;
        });
        await untilTellable(runtime);
        return;
      }
      const messageUuid = randomUUID();
      if (runtime.control?.tell(prompt, messageUuid)) {
        // 伝えた作業が終わるまで「いま」を預かる（圧縮後指示のやり取りに混ぜない）
        runtime.update({ afterCompact: runtime.afterCompact.slice(1), compactedTurn: true });
        store.events.add(chatId, { type: "user", text: m.text, ...(m.attachments.length ? { attachments: m.attachments } : {}), ...handover, post_compact: true, message_uuid: messageUuid });
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
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
      // 圧縮前指示があれば、送信待ちに入れずにいまの作業へそのまま伝え、その作業が終わったら送信待ちより先に圧縮する。足せなければ予約にする
      if (!this.tellPreCompact(chat, runtime)) runtime.queue.reserve("compact");
      return this.requireChat(chatId);
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

  /**
   * 作業中に手で頼んだ圧縮の圧縮前指示を、いまのやり取りにそのまま足す（足したら true）。指示がない・もう圧縮前指示を送った・圧縮を待っている・
   * 足せないときは false（予約にする）。足したら圧縮が終わるまで「いま」を預かり、その作業が最後まで終わったら圧縮する（compactAfterTurn）
   */
  private tellPreCompact(chat: Chat, runtime: ChatRuntime): boolean {
    const { store } = this.deps;
    if (!chat.session_id || runtime.preCompactSent || runtime.holdsTells || runtime.compactAfterTurn) return false;
    const text = preCompactPromptOf(store, store.projects.get(chat.project_id)!);
    const messageUuid = randomUUID();
    if (!text || !runtime.control?.tell(busyPreCompactMessage(text), messageUuid)) return false;
    store.events.add(chat.id, { type: "user", text, pre_compact: true, message_uuid: messageUuid });
    runtime.preCompactSent = true;
    runtime.update({ awaitingCompact: true, compactAfterTurn: true });
    return true;
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
  /**
   * 手でコンテキストを消去する（チャット欄のメーターの詳細の「コンテキストを消去」）: 作業していなければその場で消去し、送信待ちがあれば次を送る。
   * 作業中なら、いまのやり取りが終わったらすぐ消去する予約（送信待ちのいちばん上に消去の行。作業中の「会話を圧縮」と同じ）。まだ会話がなければ 409
   */
  clear(chatId: number): Chat {
    if (this.isBusy(chatId)) {
      this.runtimes.get(chatId).queue.reserve("clear");
      return this.requireChat(chatId);
    }
    return this.clearByCommand(chatId);
  }

  /** チャット欄の /clear（作業していないとき）: コンテキストを消去し、送信待ちがあれば次を送る（消去の行と同じく、次の指示は新しい会話で始まる） */
  private clearByCommand(chatId: number): Chat {
    const cleared = this.clearContext(chatId);
    void this.sendNextQueued(chatId);
    return cleared;
  }

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
    runtime.update({ awaitingCompact: false, compactAfterTurn: false });
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
      outcome = await executeTurn(this.turnDeps, runtime, item, controller.signal);
    } finally {
      runtime.turn = null;
      // 通信が切れた・使用枠の上限で止まったときは送らず、つながる・枠が戻るのを待つ（送っても失敗して消えるため。アプリを終えるときも送らない）
      const finished = this.recovery.finished(item.chatId, outcome) && !this.shuttingDown;
      // 圧縮前指示の作業が最後まで終わって、まだ圧縮していなければ、続けて圧縮する（手で頼んだ圧縮の前の指示 = thenCompact、
      // 自動の圧縮の前の指示で、作業の区切りまで圧縮が来なかったもの = awaitingCompact。次の指示を送ると、その初めに圧縮されて、指示が圧縮より上に出るため）。
      // 止めた・失敗したときは圧縮しない
      const compactNext = finished && outcome.status === "completed" && !item.compact && (Boolean(item.thenCompact) || runtime.awaitingCompact);
      const manual = Boolean(item.thenCompact) || runtime.compactAfterTurn;
      // 止めるよう頼んでいたら、終わったので停止中を消す。続けて圧縮しないなら、「いま」を預かる間も終わる
      // 圧縮したやり取りも終わったので、預かった「いま」を送れるようにする（このあとの deliverHeld で送る）
      runtime.update({ stopping: false, compactAfterTurn: false, compactedTurn: false, ...(compactNext ? {} : { awaitingCompact: false }) });
      void this.deps.usage.refresh();
      if (compactNext) {
        this.compactNow(item.chatId, manual ? "manual" : "auto");
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

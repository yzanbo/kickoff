import type { Attachment, BackgroundState, MessageMarks } from "@shared/types";
import { api } from "@/api";
import { readSetting, writeSetting } from "@/lib/storage";
import { composerHandoff } from "@/lib/storageKeys";
import { queueModeTexts, useQueueMode } from "@/features/chat/composer/QueueModeToggle";
import type { QueueSendMode } from "@/features/chat/composer/composerKeys";
import type { ChatOptionsState } from "@/features/chat/options/ChatOptionsBar";
import { confirmStopAgents } from "@/features/chat/status/backgroundLabel";
import type { TimelineScroll } from "@/features/chat/timeline/timelineScroll";
import { HOLD_TEXTS, type CompactHold } from "./compactHold";

/**
 * このチャットへの送り方（チャット欄の送信・作業中の送信・中断）。送ったら一番下に付いていく。
 * 作業中に送ったときの扱いは、チャット欄の切り替え（いま / あとで。どのチャットでも同じ）か、キー（⌘Enter = いま・⌘⇧Enter = あとで）で決める。
 * 「質問として送る」（onAsk。送信ボタンの右クリック）は、同じ送り方で送り、その指示の作業が終わったら送信待ちを自動で送らずに一時停止する
 * （答えを見て次を決める。あとで = 入れた指示のすぐあとに一時停止の印、いま・すぐ送る = その作業が終わったら止める）。
 * 中断は、裏で動いているサブエージェント・コマンドも止まることを確かめてから（onStopping: 押してから止まるまでの「停止中」）。
 * 圧縮前指示から圧縮のあとのやり取りが終わるまで（compactHold）も、送り方は切り替えのとおり（いま = コアが預かってチャット欄に出し、
 * やり取りが終わってから送る / あとで = 送信待ち）。
 * 入力欄に子チャットからの依頼を入れていれば（composerHandoff）、入力欄から送る発言に出どころ handoff_from を付け、送れたら消す
 * （定型文の帯の「すぐ送る」・「もう一度送る」は入力欄の文ではないので付けない = onSendOther）
 */
export function useChatSend({
  chatId,
  busy,
  queued,
  compactHold,
  options,
  scroll,
  background,
  runningAgents,
  onStopping,
  beforeSend,
}: {
  chatId: number;
  busy: boolean;
  /** 送信待ちがあるか（作業していなくても、送り方を選ぶ） */
  queued: boolean;
  /** 「いま」をコアが預かる間か（圧縮前指示から圧縮のあとのやり取りが終わるまで） */
  compactHold: CompactHold;
  options: ChatOptionsState;
  scroll: TimelineScroll;
  background: BackgroundState | null;
  /** 裏で動いているサブエージェントの数（一覧の知らせがない古い Claude Code のとき、一覧の行から数えたもの） */
  runningAgents: number;
  onStopping: (stopping: boolean) => void;
  /** 送る前にすること（メモのチャットで、書きかけのメモを保存してから送る。SendCancelled を投げれば送らない） */
  beforeSend?: () => Promise<void>;
}) {
  const [queueMode, setQueueMode] = useQueueMode();
  // 預かる間に「いま」を選んでいれば、いつ送るかを案内する（「あとで」はふだんと同じ送信待ち）
  const hold = busy && queueMode === "tell" ? compactHold : null;
  const texts = hold ? HOLD_TEXTS[hold] : queueModeTexts(busy, queued, queueMode);
  const send = async (text: string, attachments: Attachment[], pauseAfter = false, marks: MessageMarks = {}) => {
    await beforeSend?.();
    scroll.follow();
    await api.sendMessage(chatId, text, options.options, attachments, pauseAfter, marks);
  };
  const queue = async (text: string, attachments: Attachment[], mode: QueueSendMode = queueMode, pauseAfter = false, marks: MessageMarks = {}) => {
    // 伝える: 止めずに、いまのやり取りに足す（裏のサブエージェント・コマンドも動き続ける。足せなければコアが預かり、作業の終わりに送信待ちより先に送る）。
    // ⌘Enter / ⌘⇧Enter で送ったときは、切り替えに関係なくそのキーの送り方にする
    // 作業していない（送信待ちを止めている）とき: すぐ送る = 送信待ちより先にいま送る / ためておく = 送信待ちの最後に足す
    if (!busy) {
      if (mode !== "queue") return send(text, attachments, pauseAfter, marks);
      await beforeSend?.();
      return void (await api.queueMessage(chatId, text, options.options, attachments, { hold: true, pauseAfter, marks }));
    }
    await beforeSend?.();
    scroll.follow();
    if (mode === "tell") await api.tellChat(chatId, text, options.options, attachments, pauseAfter, marks);
    else await api.queueMessage(chatId, text, options.options, attachments, { pauseAfter, marks });
  };
  // 入力欄から送る: 子チャットからの依頼の出どころを付け、送れたら入力欄の札を消す
  const fromComposer = async (run: (marks: MessageMarks) => Promise<void>) => {
    const from = readSetting(composerHandoff(chatId));
    await run(from ? { handoff_from: from } : {});
    if (from) writeSetting(composerHandoff(chatId), null);
  };
  return {
    queueMode,
    setQueueMode,
    placeholder: texts.placeholder,
    sendLabel: texts.sendLabel,
    onSend: (text: string, attachments: Attachment[]) => fromComposer((marks) => send(text, attachments, false, marks)),
    onQueue: (text: string, attachments: Attachment[], mode?: QueueSendMode) => fromComposer((marks) => queue(text, attachments, mode, false, marks)),
    /** 質問として送る（いまの送り方で送り、その指示の作業が終わったら送信待ちを一時停止する） */
    onAsk: (text: string, attachments: Attachment[]) =>
      fromComposer((marks) => (busy || queued ? queue(text, attachments, undefined, true, marks) : send(text, attachments, true, marks))),
    /** 入力欄の文ではないものを送る（定型文の帯の「すぐ送る」・「もう一度送る」。作業中・送信待ちがあれば入力欄と同じ送り方。出どころは付けない） */
    onSendOther: (text: string, attachments: Attachment[]) => (busy || queued ? queue(text, attachments) : send(text, attachments)),
    onStop: () =>
      void confirmStopAgents(background, runningAgents, "中断する").then((ok) => {
        if (!ok) return;
        onStopping(true);
        void api.cancelChat(chatId).catch(() => onStopping(false));
      }),
  };
}

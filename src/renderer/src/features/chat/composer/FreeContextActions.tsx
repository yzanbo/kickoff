import { Hourglass, X } from "lucide-react";
import type { Chat, CompactingState, QueueAction, QueuedMessage } from "@shared/types";
import { queueActionOf } from "@shared/chat/queueActions";
import { api } from "@/api";
import { cx } from "@/lib/cx";
import type { useAction } from "@/hooks/useAction";
import { confirmDialog } from "@/ui/dialogs";
import { ErrorText } from "@/ui/ErrorText";
import { QUEUE_ACTION_LOOKS } from "@/features/chat/queue/queueActionLooks";

/** 実行中と失敗の文（ContextMeter の useAction。空け方と、予約の取り消し） */
export type FreeContextAction = ReturnType<typeof useAction<QueueAction | "cancel">>;

/** 選べる空け方ごとの文言（アイコン・色は送信待ちの挟む行と同じ QUEUE_ACTION_LOOKS） */
const CHOICES: Record<QueueAction, { label: string; hint: string; hintBusy: string; title: string; titleBusy: string; reserved: string }> = {
  compact: {
    label: "会話を圧縮",
    hint: "要約して、続きから話す",
    hintBusy: "作業が終わったら、要約して続ける",
    title: "これまでの会話を要約して、コンテキストを空けます（Claude Code の /compact）。AI は要約した内容を覚えたまま続けます",
    titleBusy: "AI のいまの作業はそのまま続けます。送信待ちのいちばん上に「会話を圧縮」を入れ、作業が終わったら、送信待ちの指示より先にすぐ会話を圧縮します",
    reserved: "いまの作業が終わったら圧縮します",
  },
  clear: {
    label: "コンテキストを消去",
    hint: "新しい会話で始める",
    hintBusy: "作業が終わったら、新しい会話にする",
    title: "これまでの会話を AI に引き継がず、次の指示から新しい会話で始めます（Claude Code の /clear と同じ）。このチャットの記録は残ります",
    titleBusy: "AI のいまの作業はそのまま続けます。送信待ちのいちばん上に「コンテキストを消去」を入れ、作業が終わったら、送信待ちの指示より先にすぐ消去します",
    reserved: "いまの作業が終わったらコンテキストを消去します",
  },
};

/**
 * チャット欄のメーターの詳細のいちばん下「コンテキストを空ける」: 会話を圧縮（要約して続ける）/ コンテキストを消去（新しい会話で始める）を、
 * 違いの一言を添えた 2 つのボタンを縦に並べて選ぶ。AI の作業中は、どちらも作業を止めずに終わってから行う予約になる（送信待ちのいちばん上に、その行を入れる）ので、
 * 見出しの下の案内「AI の作業中です。どちらも、いまの作業が終わってから行います」と、ボタンの一言「作業が終わったら、…」で分かるようにする。
 * 予約している間（reserved）は「いまの作業が終わったら…します」と「取り消す」（その行を送信待ちから消す）。
 * 圧縮前指示をいまの作業に伝えた（afterTurn）ときは、取り消せないので文だけ。消去は作業していなければすぐ行うので、先に確かめる（予約は取り消せるので確かめない）。
 * 押したら onStart（ポップオーバーを閉じ、圧縮中の弧・送信待ちの行・流れの区切りで知らせる）、始められなければ onFailed（開き直して失敗の文を見せる）。
 * 実行中と失敗の文（action）は、閉じても消えないよう、いつも描いているメーターの側で持つ
 */
export function FreeContextActions({
  action,
  chat,
  compacting,
  reserved,
  afterTurn,
  onStart,
  onFailed,
}: {
  action: FreeContextAction;
  chat: Chat;
  compacting: CompactingState | null;
  reserved: QueuedMessage | null;
  afterTurn: boolean;
  onStart: () => void;
  onFailed: () => void;
}) {
  const running = chat.status === "running";
  // まだ会話がない・圧縮中はできない
  const can = (Boolean(chat.session_id) || running) && !compacting;
  const reservedAction = reserved && running && !compacting ? queueActionOf(reserved) : null;

  const run = async (kind: QueueAction) => {
    onStart();
    if (kind === "clear" && !running) {
      const ok = await confirmDialog({
        title: "コンテキストを消去しますか？",
        message: "これまでの会話を AI に引き継がず、次の指示から新しい会話で始めます。このチャットの記録は残り、流れに区切りが入ります。",
        confirmLabel: "消去",
      });
      if (!ok) return;
    }
    const done = await action.run(kind, () => (kind === "compact" ? api.compactChat(chat.id) : api.clearContext(chat.id)));
    if (!done) onFailed();
  };

  let body;
  if (afterTurn && running && !compacting) {
    // 圧縮前指示をいまの作業に伝えた: この作業が終わったら圧縮する（指示はもう伝えたので取り消せない）
    const Icon = QUEUE_ACTION_LOOKS.compact.icon;
    body = (
      <span className={cx("context-free-note", QUEUE_ACTION_LOOKS.compact.tone)} title="圧縮前指示をいまの作業に伝えました。この作業が最後まで終わったら、送信待ちの指示より先に会話を圧縮します">
        <Icon size={13} aria-hidden /> {CHOICES.compact.reserved}
      </span>
    );
  } else if (reserved && reservedAction) {
    // 予約している: このやり取りが終わったら行う。取り消せる（送信待ちのその行を消す）
    const Icon = QUEUE_ACTION_LOOKS[reservedAction].icon;
    body = (
      <div className="context-free-reserved">
        <span className={cx("context-free-note", QUEUE_ACTION_LOOKS[reservedAction].tone)}>
          <Icon size={13} aria-hidden /> {CHOICES[reservedAction].reserved}
        </span>
        <button
          type="button"
          className="btn btn-sm"
          title={`予約を取り消します（送信待ちの「${QUEUE_ACTION_LOOKS[reservedAction].button}」の行を消します）`}
          onClick={() => void action.run("cancel", () => api.removeQueued(chat.id, reserved.id))}
        >
          <X size={13} /> 取り消す
        </button>
      </div>
    );
  } else {
    body = (
      <div className="context-free-choices">
        {(["compact", "clear"] as const).map((kind) => {
          const look = QUEUE_ACTION_LOOKS[kind];
          const Icon = look.icon;
          const choice = CHOICES[kind];
          return (
            <button key={kind} type="button" className={cx("context-choice", look.tone)} title={running ? choice.titleBusy : choice.title} disabled={!can} onClick={() => void run(kind)}>
              <Icon size={16} aria-hidden className="context-choice-icon" />
              <span className="context-choice-label">{kind === "compact" && compacting ? "圧縮中…" : choice.label}</span>
              <span className="context-choice-hint">{running ? choice.hintBusy : choice.hint}</span>
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <section className="context-section context-free">
      <span className="context-title">コンテキストを空ける</span>
      {running && !compacting && !reservedAction && !afterTurn && (
        // 作業中: どちらを選んでも、いまの作業は止めずに、終わってから行う
        <span className="context-free-when">
          <Hourglass size={12} aria-hidden /> AI の作業中です。どちらも、いまの作業が終わってから行います
        </span>
      )}
      {body}
      <ErrorText message={action.error} />
    </section>
  );
}

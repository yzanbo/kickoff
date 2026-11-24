import { MessageSquarePlus, MessagesSquare, OctagonPause } from "lucide-react";
import { useEffect } from "react";
import { createPortal } from "react-dom";
import type { ChatLive } from "@shared/chat/chatLive";
import type { Chat } from "@shared/chat/types";
import { useSetting } from "@/foundation/ui/hooks/useSetting";
import { cx } from "@/foundation/ui/lib/cx";
import { chatComposerDraft, Composer, composerPills, type ComposerSend, type OutgoingMessage, composerSettings, type useChatSend } from "@/features/composer/ui";
import type { ChatOptionsState } from "@/features/ai/ui";
import type { PromptList } from "@/features/conversation/ui/promptList/promptHistory";
import { PromptsChip } from "@/features/conversation/ui/promptList/PromptsChip";
import { QueuedMessages, RestartResumeBanner } from "@/features/queue/ui";
import { TodoChip } from "@/features/conversation/ui/todo/TodoChip";
import { childChatsApi, INHERIT_LABELS, inheritHelp, ChildChatsChip } from "@/features/childChats/ui";
import { openCreatedChild, BusyNeighborsNotice, useBusyNeighbors, useChipsPortal } from "@/features/chat/ui";
import { ComposerHandBackChip } from "@/features/childChats/ui";
import { chatSubagents, SubagentChip } from "@/features/subagents/ui";
import { voiceReplies } from "@/features/composer/ui";
import { ProviderSwitchChip } from "@/features/providerSwitch/ui";
import { useHeldEdit, HeldEditComposer } from "@/features/compact/ui";
import { RestrictionNotice } from "./RestrictionNotice";

/** 「質問として送る」の説明 */
const ASK_SEND_TITLE =
  "いまの送り方で送り、この指示の作業が終わったら、送信待ちを自動で送らずに一時停止します（答えを見てから次を決めるとき。送信待ちに入れたときは、その指示のすぐあとに一時停止を挟みます）";

/** 「新規の子チャットに送る（会話を引き継ぐ / 新しく始める）」の説明（始め方の説明は子チャットを作る画面の切り替えと同じ） */
const childSendTitle = (inherit: boolean) =>
  `新しい子チャットを作って、この文を送ります。${inheritHelp(inherit, "このチャット")}（このチャットの作業は止めません。作った子チャットは設定の「子チャットを作ったとき」で開き、上のピルの子チャットにも並びます）`;

/**
 * チャット欄の場所（流れの下）: 同じ作業場所で作業中のほかのチャットの知らせ → チャットの情報のピル（指示の履歴・ToDo・サブエージェント・一番下へ戻るボタンの置き場所）→
 * 定型文の帯 → 送信待ち（次に送るもの）→ 入力欄（いま書いているもの）
 */
export function ChatComposerArea({
  chat,
  prompts,
  live,
  options,
  send,
  onDock,
}: {
  chat: Chat;
  prompts: PromptList;
  live: ChatLive;
  options: ChatOptionsState;
  send: ReturnType<typeof useChatSend>;
  /** 一番下へ戻るボタンの置き場所（ピルの列の右端。描いたら要素が届き、流れの側で置けるか測る） */
  onDock: (dock: HTMLSpanElement | null) => void;
}) {
  const busy = chat.status === "running";
  // チャットのサブエージェント（チャット欄の上のピル）
  const { entries: subagents } = chatSubagents.useFor(chat.id);
  const busyNeighbors = useBusyNeighbors(chat.project_id, chat.worktree_path, chat.id);
  // 預かった指示を書き直している間は、チャット欄を書き直しの欄に入れ替える（ふつうの欄は隠して残す）
  const heldEdit = useHeldEdit(chat.id);
  const queued = live.queue.messages.length > 0;
  // 送信ボタンの右クリック:
  // 「質問として送る」: いまの送り方で送り、その指示の作業が終わったら送信待ちを一時停止する（答えを見て次を決める）
  // 「新規の子チャットに送る（会話を引き継ぐ / 新しく始める）」: この文と添付で新しい子チャットを作って送る（このチャットの作業は止めない。
  // 作った子チャットは設定の「子チャットを作ったとき」で開く。上のピルの子チャットにも並ぶ。選択（モデルなど）は渡さず、設定どおりの既定）。
  // ノートのチャット・アーカイブ済みでは出さない
  const noteOrArchived = Boolean(chat.note_path) || chat.archived_at !== null;
  const sendToChild = (inherit: boolean) => async ({ text, attachments }: OutgoingMessage) => {
    openCreatedChild(await childChatsApi("POST /api/chats/:chatId/children", { params: { chatId: chat.id }, body: { text, attachments, quote: null, inherit, event_id: null } }));
  };
  // 定型文の帯の「すぐ送る」: 入力欄の文はそのままにして、定型文だけを送る（作業中・送信待ちがあれば、入力欄から送るのと同じく送信待ちの送り方に従う）
  const sendSnippet = (text: string) => send.sendOther(text, []);
  // 音声モードで読み上げる候補（メインエージェントの文章の返答）。起こした文は定型文の「すぐ送る」と同じ送り方で送る（入力欄の文は残す）
  const replies = voiceReplies.useFor(chat.id);
  // 入力欄の送る口: 作業中・止めている送信待ちがあるときは送り方（いま / あとで）で送る。圧縮前指示から圧縮のあとのやり取りが終わるまでも切り替えを出す
  // （いま = チャット欄に預かり、やり取りが終わってから送る / あとで = 送信待ち）。会話の圧縮中は、右下をふだんの見た目にする（中断のボタンを出さない）
  const composerSend: ComposerSend = {
    busy,
    stopping: live.stopping,
    compacting: live.compacting !== null,
    holdsQueue: !busy && queued,
    submit: send.submit,
    // 定型文の帯の「すぐ送る」
    sendOther: sendSnippet,
    stop: send.stop,
    label: send.sendLabel,
    alternatives: [
      { label: "質問として送る", hint: "答えが返ったら、送信待ちを一時停止", icon: OctagonPause, title: ASK_SEND_TITLE, submit: send.ask },
      ...(noteOrArchived
        ? []
        : [true, false].map((inherit) => ({
            // 子チャットの 2 つは「新規の子チャットに送る」の見出しの下に 1 組で並べる
            group: "新規の子チャットに送る",
            label: inherit ? INHERIT_LABELS.inherit : INHERIT_LABELS.fresh,
            hint: inherit ? "このチャットの会話の続きとして始める" : "会話は渡さず、書いた文だけで始める",
            icon: inherit ? MessagesSquare : MessageSquarePlus,
            title: childSendTitle(inherit),
            submit: sendToChild(inherit),
          }))),
    ],
  };
  // ノートのチャットの欄を閉じている間は、ピルの列と送信待ちをノートの下の入力欄の上に描く（chipsPortal）
  const portal = useChipsPortal();
  // チャット欄のコンパクト表示は、上のピルの列にも効かせる（ピルを低く・小さな文字に。QueuedMessages.css）
  const [compact] = useSetting(composerSettings.compact);
  const chips = (
    <div className={cx("composer-chips", compact && "compact")}>
      <PromptsChip prompts={prompts.history} />
      <TodoChip chatId={chat.id} prompts={prompts.byId} />
      <SubagentChip entries={subagents} chat={chat} busy={busy} models={options.models} />
      <ChildChatsChip chatId={chat.id} />
      {composerPills().map((Pill, i) => (
        <Pill key={i} projectId={chat.project_id} chatId={chat.id} />
      ))}
      {/* 上を読んでいる間の一番下へ戻るボタンの置き場所（右端。入る幅があるときだけ流れの側から置く） */}
      {!portal?.target && <span ref={onDock} className="composer-chips-dock" />}
    </div>
  );
  // 制限の知らせとピルの列（外に描く先があればそこへ）
  const aboveComposer = (
    <>
      <RestrictionNotice sandboxEnabled={chat.sandbox_enabled} editScopeEnabled={chat.edit_scope_enabled} />
      {chips}
    </>
  );
  // 起動したときの再開の確かめ: 送信待ちを聞いていれば送信待ちの上に、作業の途中で止まったことだけなら入力欄の上に帯を出す
  const resume = live.restart_resume;
  const queuedList = <QueuedMessages queue={live.queue} busy={busy} childChats={!noteOrArchived} resume={resume?.queued ? resume : null} />;
  // 外の入力欄（ノートの下）にも、送信待ちがあるかを知らせる（あれば、チャット欄と同じく送るものを送信待ちに足す）
  useEffect(() => portal?.onQueued(queued), [portal, queued]);
  return (
    <div className="chat-composer">
      {/*
        同じ作業場所で、ほかのチャットも作業中なら知らせる（同じファイルを触るとぶつかる）。押して開くピルの列とは役割が違うので、
        ピルに混ぜず、その上の 1 行に分ける（ピルの横に並べると、ピルの一つに見え、狭いと折り返してピルの間に入る）
      */}
      <BusyNeighborsNotice count={busyNeighbors} />
      {/* チャット欄のすぐ上に、このチャットのサブエージェントなどをピルで並べる（外に描く先があればそこへ。一番下へ戻るボタンは流れの側に残す） */}
      {portal?.target ? createPortal(aboveComposer, portal.target) : aboveComposer}
      {/* 送信待ちの指示は入力欄のすぐ上（流れ → チャットの情報 → 次に送るもの → いま書いているもの の順。外に描く先があれば、そこの入力欄の上へ） */}
      {/* 作業の途中で止まったことだけを聞いているときの帯は、送信待ち・入力欄の上（送信待ちと入力欄の 1 枚の枠を切らない） */}
      {resume && !resume.queued && <RestartResumeBanner chatId={chat.id} resume={resume} standalone />}
      {portal?.queueTarget ? createPortal(queuedList, portal.queueTarget) : queuedList}
      {heldEdit && <HeldEditComposer chat={chat} edit={heldEdit} gone={!live.now.some((m) => m.id === heldEdit.id)} />}
      {/* 預かった指示を書き直している間は、ふつうのチャット欄を隠して残す（書きかけの文・添付はそのまま。ChatColumn.css の .chat-composer:has(> .held-edit)） */}
      <Composer
        place={{
          projectId: chat.project_id,
          worktree: chat.worktree_path,
          chatId: chat.id,
        }}
        options={options}
        // チャットの AI（どのチャットでもいつも出す。押すと Claude Code・Codex を切り替える）
        providerChip={<ProviderSwitchChip chat={chat} busy={busy} />}
        placeholder={send.placeholder}
        send={composerSend}
        // 入力欄に入れた子チャットからの依頼の出どころの札（送ると発言の札になる）。その下に定型文の帯（差し込み）
        header={<ComposerHandBackChip chatId={chat.id} />}
        voiceMode={{ replies, send: sendSnippet, chatId: chat.id }}
        history={prompts.recalls}
        draft={chatComposerDraft(chat.id)}
      />
    </div>
  );
}

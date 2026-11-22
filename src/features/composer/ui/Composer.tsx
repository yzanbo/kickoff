import { useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { markInteractive } from "@/foundation/ui/lib/bootMarks";
import { cx } from "@/foundation/ui/lib/cx";
import { useSetting } from "@/foundation/ui/hooks/useSetting";
import { consumeKey, isCancelKey } from "@/foundation/ui/lib/keys";
import { COMPOSER_COMPACT } from "@/foundation/ui/storage/storageKeys";
import { ErrorText } from "@/foundation/ui/kit/ErrorText";
import { ChatOptionsBar, type ChatOptionsState } from "@/features/ai/ui/options/ChatOptionsBar";
import { AttachButton } from "./AttachButton";
import { PendingFileChips } from "./PendingFileChips";
import type { VoiceReply } from "./selectors";
import { composerParts, useVoiceMode, type ComposerPlace, type ComposerVoiceModeInput } from "./composerSlots";
import type { ComposerSend } from "./composerModel";
import { SuggestList } from "./suggest/SuggestList";
import { useSuggest } from "./suggest/useSuggest";
import { useDraftFiles } from "./useDraftFiles";
import { memoryDraft, useDraftText, type ComposerDraft } from "./composerDraft";
import { ComposerInsertProvider, useComposerField } from "./composerFields";
import { usePromptHistory } from "./usePromptHistory";
import { sendModeOf, useComposerKeys, type SendWhen } from "./composerKeys";
import { MessageField, useMessageField } from "./MessageField";
import { PLAIN_SUBMIT, type SubmitHow } from "./messageFieldModel";
import { ComposerActions } from "./ComposerActions";
import { QueueModeToggle, useQueueMode } from "./QueueModeToggle";
import { useComposerSend } from "./useComposerSend";
import { ChatContextButton } from "./ChatContextButton";
import { useComposerTextMenu } from "./useComposerTextMenu";
import { useComposerBarFit } from "./useComposerBarFit";

interface Props {
  /** どこの入力欄か（候補の作業場所・「ほかのチャットを参照」で除くチャット・差し込み） */
  place: ComposerPlace;
  /** 書きかけの文と送る前の添付の残し先（既存のチャットは chatComposerDraft。渡さなければ入力欄を作り直すと消える） */
  draft?: ComposerDraft;
  /** 送る口と作業中の様子 */
  send: ComposerSend;
  /** モデル・推論の深さ・権限モードの選択（なければ出さない。サブエージェントのタブなど） */
  options?: ChatOptionsState;
  /** ↑↓ で呼び出す、このチャットで前に送った自分の発言（新しい順。新しいチャットの入力欄では渡さない） */
  history?: string[];
  /** 音声モード（波形のボタン）を出すとき: 読み上げる候補の返答と、起こした文を送る口。既存のチャットは chatId、送る前の新しいチャットは draft */
  voiceMode?: Pick<ComposerVoiceModeInput, "replies" | "send" | "chatId" | "draft">;
  /** 枠の中のいちばん上に置く、場所だけの帯（預かった指示の書き直しの帯・子チャットからの依頼の札）。定型文の帯はその下に差し込む */
  header?: ReactNode;
  /** 使う AI の札（下の行のモデルの左に置く） */
  providerChip?: ReactNode;
  placeholder: string;
  autoFocus?: boolean;
}

const NO_REPLIES: VoiceReply[] = [];

/** 停止中に Esc を押したとき（もう止めているので何もしない） */
const ignoreStop = () => {};

/**
 * チャットの入力欄（Enter で送信・Shift+Enter で改行。📎・ドラッグ＆ドロップ・貼り付けでファイルを添付。音声入力と音声モードは差し込み）。
 * 文を書く欄は MessageField、送る処理は useComposerSend、右下の操作（中断・送信・送り方の切り替え）は ComposerActions。
 * 定型文の帯・右クリックの項目・右下のメーターは差し込み（composerSlots）で、place.slots で出さないものを選ぶ
 */
export function Composer({ place, draft, send, options, history, voiceMode, header, providerChip, placeholder, autoFocus }: Props) {
  const parts = composerParts();
  const shows = { band: place.slots?.band !== false, meter: place.slots?.meter !== false, menu: place.slots?.menu !== false };
  // 新しいチャットも含め、入力欄は空から始める（あらかじめ文を入れない）。既存のチャットだけは、自分が書きかけていた文を戻す
  const [ownDraft] = useState(() => memoryDraft());
  const store = draft ?? ownDraft;
  const [text, setText] = useDraftText(store);
  // 入力欄が置かれた（起動の時刻の記録）
  useLayoutEffect(() => markInteractive("composer"), []);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // 外からピントを移せるよう、描いている間だけ下書きの残す先ごとの登録簿に載せる（focusComposer・focusDraft）
  useComposerField(store.id, textareaRef);
  const attach = useDraftFiles(store);
  /** 文をキャレットの位置に入れる（選んでいればその範囲と置き換える。入れた後ろにキャレットを置く。定型文の帯から） */
  const insert = (value: string) => {
    const el = textareaRef.current;
    const current = el?.value ?? text;
    const start = el?.selectionStart ?? current.length;
    const end = el?.selectionEnd ?? current.length;
    const at = start + value.length;
    setText(current.slice(0, start) + value + current.slice(end));
    requestAnimationFrame(() => {
      const target = textareaRef.current;
      target?.focus();
      target?.setSelectionRange(at, at);
    });
  };
  // 文を書く欄の右クリック（切り取り・コピー・貼り付けと、差し込みの項目）
  const menuItems = shows.menu && parts.menus.length > 0 ? parts.menus.map((Items, i) => <Items key={i} place={place} />) : undefined;
  const textMenu = useComposerTextMenu({ textareaRef, setText, items: menuItems });
  // コンパクト表示（文字・余白・下の道具を小さくする。設定の「表示」で切り替え、どのチャット欄にもすぐ効く）
  const [compact] = useSetting(COMPOSER_COMPACT);
  // ↑↓ で前の発言を呼び出す
  const promptHistory = usePromptHistory({ prompts: history, text, setText, textareaRef });
  // / と @ の候補（作業場所から探す）。呼び出した発言を出している間は出さない
  const suggest = useSuggest({ target: place.worktree ? { projectId: place.projectId, worktree: place.worktree } : place.projectId, text, setText, textareaRef, paused: promptHistory.recalled });
  // 文を書く欄（Enter で送る・⌘⇧Enter も。候補を出している間は ↑↓・Enter・Tab・Esc を候補に、空の欄・呼び出した発言の ↑↓ は前の発言に使う）。
  // 音声入力（マイク・⌘⇧Space）も欄が持つ。録音中の Enter・送信ボタンは、起こした文を入れてそのまま送る
  const field = useMessageField({
    value: text,
    onChange: setText,
    onSubmit: (how) => submit(how),
    onKeyDown: (e) => suggest.handleKey(e) || promptHistory.handleKey(e),
    metaShift: true,
    textareaRef,
    keepHeldOnBlur: true,
  });
  // 書いた分だけ高さを伸ばすのは CSS（composer.css の field-sizing: content と max-height）に任せる（打つたびに測らない）
  const sender = useComposerSend({
    text,
    files: attach,
    send,
    recording: field.voice.recording,
    onSent: () => {
      setText("");
      attach.clear();
      // 音声モードの間に入力欄から送ったら、止めていた読み上げを戻して、その返答を読む
      voice.noteSent();
    },
  });
  // 作業中の送り方（いま / あとで。どのチャットでも同じ）。作業中・止めている送信待ちがあるときに出す
  const [queueMode, setQueueMode] = useQueueMode();
  const queueToggle = <QueueModeToggle busy={Boolean(send.busy)} value={queueMode} onChange={setQueueMode} />;
  // 音声モード: 話し終わったら、すぐ送る（その間は文を書く欄を隠して帯を出す）か、入力欄に入れる。返答は読み上げる（composerSlots の voice）
  const voice = useVoiceMode(field.bridge, {
    replies: voiceMode?.replies ?? NO_REPLIES,
    busy: Boolean(send.busy),
    send: (spoken) => voiceMode?.send(spoken) ?? Promise.resolve(),
    draft: voiceMode?.draft,
    chatId: voiceMode?.chatId,
    // すぐ送るときの作業中の送り方は既存のチャットだけ
    queueToggle: voiceMode && !voiceMode.draft ? queueToggle : undefined,
  });

  /** 送信ボタン・Enter（⌘Enter = いま・⌘⇧Enter = あとで。録音中なら、文を書く欄が止めて起こした文を入れてから呼ぶ） */
  const submit = (how: SubmitHow) => {
    // 新しいチャットで音声モードの間に送るなら、できたチャットへ音声モードを引き継ぐ
    if (voice.active) voice.beforeSend();
    void sender.send(sendModeOf(how));
  };

  // ⌘ / ⌘⇧ を押している間だけ、その送り方のボタンを光らせる（選んでいる送り方そのものは変えない。キーを離した・ピントが枠の外へ出たら消す）
  const held = field.held;
  const heldMode: SendWhen | undefined = held.held === "meta-shift" ? "later" : held.held === "meta" ? "now" : undefined;
  // 停止中の Esc は何もしない（パネルを閉じる Esc にも渡さない）
  const keys = useComposerKeys({ busy: send.busy, onStop: send.stopping ? ignoreStop : send.stop, options });
  // 下の行を 1 行に収める段階（入らなくなったらアイコンだけにする。中身の幅が変わるものが変わったら測り直す）
  const { ref: barRef, className: barClass } = useComposerBarFit(
    [send.busy, send.stopping, keys.stopArmed, sender.queueing, send.holdsQueue, send.compacting, compact, send.label, options?.model, options?.effort, options?.permission, options?.fastMode].join("|"),
  );

  /** 枠の中のキー: 音声モードの Esc でやめる・ボタンにピントがあるときの音声のキー。ほかは Esc 2 回で中断・Shift+Tab で権限モード（composerKeys.ts） */
  function onComposerKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    held.track(e);
    if (voice.active && isCancelKey(e)) {
      consumeKey(e);
      voice.stop();
    } else if (e.defaultPrevented || !field.voice.onKeyDown(e)) {
      // 文を書く欄が先に扱った音声のキーは見ない
      keys.onKeyDown(e);
    }
  }

  const Meter = shows.meter ? parts.meter : null;
  return (
    <div
      className={cx("composer", attach.dragging && "dragging", compact && "compact")}
      onKeyDown={onComposerKeyDown}
      onKeyUp={held.track}
      onBlur={(e) => !e.currentTarget.contains(e.relatedTarget) && held.clear()}
      {...attach.dropProps}
    >
      <ComposerInsertProvider value={insert}>
        {header}
        {shows.band && parts.bands.map((Band, i) => <Band key={i} place={place} send={send.sendOther} />)}
      </ComposerInsertProvider>
      {attach.files.length > 0 && (
        <div className="composer-attachments">
          <PendingFileChips files={attach.files} onRemove={attach.removeFile} />
        </div>
      )}
      <SuggestList suggest={suggest} />
      {voice.panel}
      <MessageField
        field={field}
        hidden={voice.sends}
        rows={1}
        autoFocus={autoFocus}
        placeholder={placeholder}
        onCaret={suggest.onCaret}
        onPaste={attach.onPaste}
        onContextMenu={textMenu.onContextMenu}
      />
      {textMenu.element}
      <div ref={barRef} className={cx("composer-bar", barClass)} onContextMenu={textMenu.onBarContextMenu}>
        <div className="composer-tools">
          <AttachButton size="lg" iconSize={16} className="attach-button" onFiles={attach.addFiles} />
          <ChatContextButton projectId={place.projectId} exclude={place.chatId ?? undefined} onPick={attach.addChat} />
          {providerChip}
          {options && <ChatOptionsBar state={options} />}
        </div>
        <ComposerActions
          busy={send.busy}
          stopping={send.stopping}
          stopArmed={keys.stopArmed}
          onStop={send.stop}
          queueing={sender.queueing}
          heldMode={heldMode}
          busyControls={voice.sends ? undefined : queueToggle}
          trailing={Meter && <Meter place={place} />}
          voice={
            <>
              {!voice.active && field.voice.button}
              {voiceMode && voice.button}
            </>
          }
          canSend={sender.canSend}
          recording={field.voice.recording}
          hasContent={sender.hasContent}
          sendLabel={send.label}
          onSubmit={() => field.submit(PLAIN_SUBMIT)}
          plain={send.compacting}
          // 録音中は、文字起こしが済むまでほかの送り先には送らない（viaReady）
          sendTargets={send.alternatives?.map((to) => ({ label: to.label, hint: to.hint, icon: to.icon, group: to.group, title: to.title, disabled: !sender.viaReady, onSelect: () => void sender.sendVia(to) }))}
        />
      </div>
      {attach.dragging && <div className="drop-hint">ここにドロップして添付</div>}
      {field.voice.error}
      <ErrorText message={sender.error} className="composer-error" />
    </div>
  );
}

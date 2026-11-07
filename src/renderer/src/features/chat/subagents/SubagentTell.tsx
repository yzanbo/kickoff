import { Reply } from "lucide-react";
import { useRef, type KeyboardEvent } from "react";
import type { Attachment } from "@shared/types";
import type { SubagentEntry } from "@shared/chat/subagents";
import { relayMessage } from "@shared/chat/prompts";
import { api } from "@/api";
import { isCancelKey, isComposing, consumeKey } from "@/lib/keys";
import { SUBAGENT_ASK_MODE, subagentTellDraft } from "@/lib/storageKeys";
import { useSetting } from "@/hooks/useSetting";
import { Segmented } from "@/ui/Segmented";
import { CloseButton } from "@/ui/IconButton";
import { Composer } from "@/features/chat/composer/Composer";
import type { ComposerHandle } from "@/features/chat/composer/composerHandle";
import type { QueueSendMode } from "@/features/chat/composer/composerKeys";
import { QueueModeToggle, useQueueMode } from "@/features/chat/composer/QueueModeToggle";
import { useChatOptions } from "@/features/chat/options/ChatOptionsBar";
import { SnippetBar, SnippetBarToggleItem } from "@/features/snippet/SnippetBar";
import { openCreatedChild } from "@/features/chat/children/openChild";
import type { SubagentsView } from "./subagentsContext";

type AskMode = "relay" | "child";

/** 送り先の名前（切り替え・案内で同じ言葉にする。伝えるはサブエージェントに直接届かず、メインエージェントが渡すので、経由することを名前に出す） */
const ASK_MODE_LABELS: Record<AskMode, string> = { relay: "メインエージェント経由で伝える", child: "子チャットで聞く" };

/** 送り先の説明（切り替えに乗せたときだけ出す。いつも出すと右の欄で 2〜3 行を取るため） */
const ASK_MODE_HELP: Record<AskMode, string> = {
  relay: "Kickoff からサブエージェントへ直接は送れないので、メインエージェントが SendMessage で渡します（作業に反映されます）",
  child: "会話の記録を読んだ別の AI が答えます（サブエージェントとメインエージェントには届きません）",
};

/**
 * そのサブエージェントへの入力欄（右の欄の画面のいちばん下・流れの中のカードの「伝える」で共通）。上の切り替えで送り先を選ぶ（最後に選んだ方を覚える SUBAGENT_ASK_MODE）:
 * - メインエージェント経由で伝える: Kickoff から直接は送れないので、メインエージェントに  SendMessage でそのまま渡してもらう（メインエージェントが作業中なら止めずに伝え、
 *   作業中でなければすぐ送る。どちらも tell の API が決める）。送った文は、そのサブエージェントの流れに自分の発言として出る。
 *   終わったサブエージェントに伝えると、終わったところから再開する（案内に出す）。
 * - 子チャットで聞く: サブエージェントの会話の記録（コアが Claude Code の記録から読む）を添付にした子チャットを作って聞く（`api.askSubagentInChild`）。
 *   メインエージェントにもサブエージェント本人にも伝わらず、メインエージェントが作業中でもすぐ送る。作った子チャットは設定の「子チャットを作ったとき」で開く。
 * 書きかけの文はサブエージェントごとに残す（subagentTellDraft。送り先によらず共通）。Claude Code がサブエージェントの ID を知らせていなければどちらも送れないので、その旨を出す。
 * 入力欄はチャット欄と同じ形にそろえ、効くものだけを出す: 定型文の帯・ほかのチャットの参照はどちらでも。伝えるときは、メインエージェントの作業中に いま / あとで
 * （チャット欄と同じ QUEUE_MODE。あとで = メインのチャットの送信待ちに伝える文を入れる）。子チャットで聞くときは、モデル・深さ・権限・ファスト（作る子チャットに効かせる。
 * 初めは設定どおりの既定）。伝えるときのモデルなど（サブエージェントのモデルはメインエージェントが起動したときに決まり、変えられない）とコンテキストのメーター
 * （サブエージェントごとの使用率は Claude Code が知らせない）は出さない
 */
export function SubagentTellComposer({ entry, view, autoFocus, onSent }: { entry: SubagentEntry; view: SubagentsView; autoFocus?: boolean; onSent?: () => void }) {
  const { agentId, description } = entry;
  const [mode, setMode] = useSetting(SUBAGENT_ASK_MODE);
  const [queueMode, setQueueMode] = useQueueMode();
  // 子チャットで聞くときの選択（新しいチャットと同じく、プロジェクトの既定 → 設定の既定から）
  const options = useChatOptions(undefined, view.projectId, view.worktree ?? undefined);
  const composer = useRef<ComposerHandle | null>(null);
  if (!agentId) return <p className="muted small">このサブエージェントには伝えられません（Claude Code がサブエージェントの ID を知らせていないため）。</p>;
  // 伝える: メインエージェントの作業中に「あとで」なら、メインのチャットの送信待ちに入れる（それ以外は止めずに伝える / すぐ送る）
  const relay = async (text: string, attachments: Attachment[], sendMode?: QueueSendMode) => {
    const message = relayMessage(agentId, description, text);
    if (view.busy && (sendMode ?? queueMode) === "queue") await api.queueMessage(view.chatId, message, {}, attachments);
    else await api.tellChat(view.chatId, message, {}, attachments);
    onSent?.();
  };
  const ask = async (text: string, attachments: Attachment[]) => {
    const child = await api.askSubagentInChild(view.chatId, agentId, { text, attachments, options: options.options });
    onSent?.();
    openCreatedChild(child);
  };
  const child = mode === "child";
  const send = (text: string, attachments: Attachment[], sendMode?: QueueSendMode) => (child ? ask(text, attachments) : relay(text, attachments, sendMode));
  const later = !child && view.busy && queueMode === "queue";
  const placeholder = child
    ? `サブエージェント「${description}」について聞きたいこと（会話の記録を添えた子チャットを作ります。Enter で送信）`
    : later
      ? `サブエージェント「${description}」への指示（メインのチャットの送信待ちに入れ、いまの作業が終わったら伝えます。Enter で送信）`
      : entry.status === "running"
        ? `サブエージェント「${description}」への追加の指示（メインエージェントが SendMessage で渡します。Enter で送信）`
        : `サブエージェント「${description}」への指示（伝えると、終わったところから再開します。メインエージェントが SendMessage で渡します）`;
  return (
    <>
      <div className="inherit-choice subagent-ask-choice">
        <Segmented<AskMode>
          className="segmented inherit-choice-switch"
          label="サブエージェントへの送り先"
          value={mode}
          options={[
            { value: "relay", label: ASK_MODE_LABELS.relay, tip: `${ASK_MODE_LABELS.relay}（${ASK_MODE_HELP.relay}。終わっていれば、終わったところから再開します）` },
            { value: "child", label: ASK_MODE_LABELS.child, tip: `${ASK_MODE_LABELS.child}（${ASK_MODE_HELP.child}）` },
          ]}
          onChange={setMode}
        />
      </div>
      <Composer
        // 子チャットで聞くときは、メインエージェントが作業中でもいま / あとでを聞かずにすぐ送る（メインエージェントの作業には関わらない）
        busy={child ? false : view.busy}
        autoFocus={autoFocus}
        placeholder={placeholder}
        sendLabel={child ? "子チャットで聞く" : later ? "送信待ちに入れる" : "メインエージェント経由で伝える"}
        onSend={(text, attachments) => send(text, attachments)}
        onQueue={send}
        // 伝えるときだけ、メインエージェントの作業中に いま / あとで を選ぶ（チャット欄と同じ設定）
        busyControls={child ? undefined : <QueueModeToggle busy value={queueMode} onChange={setQueueMode} />}
        // 子チャットで聞くときだけ、作る子チャットのモデルなどを選ぶ
        options={child ? options : undefined}
        // よく送る指示（このプロジェクトの定型文）。「すぐ送る」は、いまの送り先にそのまま送る
        header={<SnippetBar projectId={view.projectId} composer={composer} onSend={(text) => send(text, [])} />}
        menuItems={<SnippetBarToggleItem />}
        chatContext={{ projectId: view.projectId, exclude: view.chatId }}
        handleRef={composer}
        suggestTarget={{ projectId: view.projectId, worktree: view.worktree ?? undefined }}
        draft={subagentTellDraft(`${view.chatId}:${entry.key}`)}
      />
    </>
  );
}

/**
 * 流れの中のカードの「伝える」で、カードのいちばん下に開く入力欄（閉じているカードでも開く。送り先の切り替えも同じ）。開いたらすぐ書けるようにピントを置く。
 * Enter で送って閉じ、Esc・× でやめる（書きかけの文は残り、もう一度「伝える」で戻る）
 */
export function SubagentTellBox({ entry, view, onClose }: { entry: SubagentEntry; view: SubagentsView; onClose: () => void }) {
  const onKeyDown = (e: KeyboardEvent) => {
    // 入力欄の中で先に使ったキー（候補の一覧を閉じるなど）・日本語の変換をやめる Esc は見ない。パネルを閉じる Esc にも渡さない
    if (!isCancelKey(e) || e.defaultPrevented || isComposing(e)) return;
    consumeKey(e);
    onClose();
  };
  return (
    <div className="subagent-tell-box" onKeyDown={onKeyDown}>
      <div className="subagent-tell-head">
        <Reply size={12} aria-hidden />
        <span className="subagent-tell-title">
          「<strong>{entry.description}</strong>」に伝える・聞く
        </span>
        <CloseButton label="やめる（Esc。書きかけの文は残ります）" size={13} type="button" onClick={onClose} />
      </div>
      <SubagentTellComposer entry={entry} view={view} autoFocus onSent={onClose} />
    </div>
  );
}

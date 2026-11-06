import { Reply } from "lucide-react";
import type { KeyboardEvent } from "react";
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
import { openCreatedChild } from "@/features/chat/children/openChild";
import type { SubagentsView } from "./subagentsContext";

type AskMode = "relay" | "child";

/** 送り先の名前（切り替え・案内で同じ言葉にする） */
const ASK_MODE_LABELS: Record<AskMode, string> = { relay: "メインから伝える", child: "子チャットで直接聞く" };

/** 選んだ送り先の説明 1 行（子チャットの「会話を引き継ぐ / 新しく始める」と同じく、切り替えのすぐ横に短く） */
const ASK_MODE_HELP: Record<AskMode, string> = {
  relay: "メインのエージェントが SendMessage で渡し、サブエージェント本人が続けます",
  child: "このサブエージェントの会話の記録を添えた子チャットで聞きます（本人とメインには伝わりません）",
};

/**
 * そのサブエージェントへの入力欄（右の欄の画面のいちばん下・流れの中のカードの「伝える」で共通）。上の切り替えで送り先を選ぶ（最後に選んだ方を覚える SUBAGENT_ASK_MODE）:
 * - メインから伝える: Kickoff から直接は送れないので、メインのエージェントに SendMessage でそのまま渡してもらう（メインが作業中なら止めずに伝え、
 *   作業中でなければすぐ送る。どちらも tell の API が決める）。送った文は、そのサブエージェントの流れに自分の発言として出る。
 *   終わったサブエージェントに伝えると、終わったところから再開する（案内に出す）。
 * - 子チャットで直接聞く: サブエージェントの会話の記録（コアが Claude Code の記録から読む）を添付にした子チャットを作って聞く（`api.askSubagentInChild`）。
 *   メインのエージェントにもサブエージェント本人にも伝わらず、メインが作業中でもすぐ送る。作った子チャットは設定の「子チャットを作ったとき」で開く。
 * 書きかけの文はサブエージェントごとに残す（subagentTellDraft。送り先によらず共通）。Claude Code がサブエージェントの ID を知らせていなければどちらも送れないので、その旨を出す
 */
export function SubagentTellComposer({ entry, view, autoFocus, onSent }: { entry: SubagentEntry; view: SubagentsView; autoFocus?: boolean; onSent?: () => void }) {
  const { agentId, description } = entry;
  const [mode, setMode] = useSetting(SUBAGENT_ASK_MODE);
  if (!agentId) return <p className="muted small">このサブエージェントには伝えられません（Claude Code がサブエージェントの ID を知らせていないため）。</p>;
  const relay = async (text: string, attachments: Attachment[]) => {
    await api.tellChat(view.chatId, relayMessage(agentId, description, text), {}, attachments);
    onSent?.();
  };
  const ask = async (text: string, attachments: Attachment[]) => {
    const child = await api.askSubagentInChild(view.chatId, agentId, { text, attachments });
    onSent?.();
    openCreatedChild(child);
  };
  const child = mode === "child";
  const placeholder = child
    ? `サブエージェント「${description}」に直接聞きたいこと（会話の記録を添えた子チャットを作ります。Enter で送信）`
    : entry.status === "running"
      ? `サブエージェント「${description}」への追加の指示（メインのエージェントが SendMessage で渡します。Enter で送信）`
      : `サブエージェント「${description}」への指示（伝えると、終わったところから再開します。メインのエージェントが SendMessage で渡します）`;
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
        <span className="inherit-choice-help muted small">{ASK_MODE_HELP[mode]}</span>
      </div>
      <Composer
        // 子チャットで聞くときは、メインが作業中でもいま / あとでを聞かずにすぐ送る（メインの作業には関わらない）
        busy={child ? false : view.busy}
        autoFocus={autoFocus}
        placeholder={placeholder}
        sendLabel={child ? "子チャットで聞く" : "伝える"}
        onSend={child ? ask : relay}
        onQueue={(text, attachments) => (child ? ask : relay)(text, attachments)}
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

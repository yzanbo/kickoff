import { Reply } from "lucide-react";
import type { KeyboardEvent } from "react";
import type { Attachment } from "@shared/types";
import type { SubagentEntry } from "@shared/chat/subagents";
import { relayMessage } from "@shared/chat/prompts";
import { api } from "@/api";
import { isCancelKey, isComposing, consumeKey } from "@/lib/keys";
import { subagentTellDraft } from "@/lib/storageKeys";
import { CloseButton } from "@/ui/IconButton";
import { Composer } from "@/features/chat/composer/Composer";
import type { SubagentsView } from "./subagentsContext";

/**
 * そのサブエージェントに伝える入力欄（右の欄の画面のいちばん下・流れの中のカードの「伝える」で共通）。
 * Kickoff から直接は送れないので、メインのエージェントに SendMessage でそのまま渡してもらう（メインが作業中なら止めずに伝え、
 * 作業中でなければすぐ送る。どちらも tell の API が決める）。送った文は、そのサブエージェントの流れに自分の発言として出る。
 * 終わったサブエージェントに伝えると、終わったところから再開する（案内に出す）。書きかけの文はサブエージェントごとに残す（subagentTellDraft）。
 * Claude Code がサブエージェントの ID を知らせていなければ送れないので、その旨を出す
 */
export function SubagentTellComposer({ entry, view, autoFocus, onSent }: { entry: SubagentEntry; view: SubagentsView; autoFocus?: boolean; onSent?: () => void }) {
  const { agentId, description } = entry;
  if (!agentId) return <p className="muted small">このサブエージェントには追加の指示を送れません（Claude Code がサブエージェントの ID を知らせていないため）。</p>;
  const relay = async (text: string, attachments: Attachment[]) => {
    await api.tellChat(view.chatId, relayMessage(agentId, description, text), {}, attachments);
    onSent?.();
  };
  const placeholder =
    entry.status === "running"
      ? `サブエージェント「${description}」への追加の指示（メインのエージェントが SendMessage で渡します。Enter で送信）`
      : `サブエージェント「${description}」への指示（伝えると、終わったところから再開します。メインのエージェントが SendMessage で渡します）`;
  return (
    <Composer
      busy={view.busy}
      autoFocus={autoFocus}
      placeholder={placeholder}
      sendLabel="伝える"
      onSend={relay}
      onQueue={(text, attachments) => relay(text, attachments)}
      suggestTarget={{ projectId: view.projectId, worktree: view.worktree ?? undefined }}
      draft={subagentTellDraft(`${view.chatId}:${entry.key}`)}
    />
  );
}

/**
 * 流れの中のカードの「伝える」で、カードのいちばん下に開く入力欄（閉じているカードでも開く）。開いたらすぐ書けるようにピントを置く。
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
          「<strong>{entry.description}</strong>」に伝える
        </span>
        <span className="muted">メインのエージェントから伝えます</span>
        <CloseButton label="やめる（Esc。書きかけの文は残ります）" size={13} type="button" onClick={onClose} />
      </div>
      <SubagentTellComposer entry={entry} view={view} autoFocus onSent={onClose} />
    </div>
  );
}

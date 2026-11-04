import { useCallback } from "react";
import { api } from "@/api";
import { Composer } from "@/features/chat/composer/Composer";
import { useSubagents } from "./Subagents";
import { relayMessage } from "./subagentRelay";
import { SubagentView } from "./SubagentView";
import { relativize } from "@/features/chat/timeline/timelineItems";
import { useChatDetail } from "@/features/chat/pane/useChatDetail";

/**
 * パネルのタブで開いたサブエージェントの中身（チャットのサブエージェントの一覧・ツールのまとまりの「中身を見る」から開く）。
 * 親のチャットの記録を読み、そのサブエージェントの分だけを出す（作業中は追記されていく）。
 * 下の入力欄から追加の指示を送れる: メインのエージェントに、SendMessage でこのサブエージェントへそのまま伝えてもらう
 * （サブエージェントは続きから始める）。メインが作業中なら止めずに伝え（いまの手順の切れ目で読む）、伝えられなければ送信待ちに入れる
 */
export function SubagentPane({
  projectId,
  chatId,
  toolUseId,
  onOpenSubagent,
}: {
  projectId: number;
  chatId: number;
  toolUseId: string;
  /** 同じチャットのほかのサブエージェントを、パネルのタブで開く（やり直した回へ移る） */
  onOpenSubagent: (toolUseId: string, title: string) => void;
}) {
  const { chat, project, events, live, error } = useChatDetail(chatId, projectId);
  const busy = chat ? chat.status === "running" : false;
  const subagents = useSubagents(chatId, events, busy, live.background);
  // 流れの各項目の memo が効くよう、作業場所が変わらない間は同じ関数にする
  const repoPath = project?.repo_path;
  const rel = useCallback((s: string) => (repoPath ? relativize(s, repoPath) : s), [repoPath]);
  if (error) return <div className="page error">{error}</div>;
  if (!chat) return <div className="page muted">読み込み中…</div>;
  const entry = subagents.find((s) => s.key === toolUseId);
  if (!entry) return <div className="page muted">このサブエージェントは見つかりません（チャットを書き直した・巻き戻したときなど）</div>;
  const agentId = entry.agentId;
  // 作業中でなければすぐ送り、作業中なら止めずに伝える（どちらも tell の API が決める）
  const relay = async (text: string, attachments: Parameters<typeof api.tellChat>[3]) => {
    if (agentId) await api.tellChat(chat.id, relayMessage(agentId, entry.description, text), {}, attachments);
  };
  return (
    <div className="subagent-pane">
      <SubagentView
        chatId={chat.id}
        entry={entry}
        events={events}
        rel={rel}
        busy={busy}
        onOpen={(key) => {
          const target = subagents.find((s) => s.key === key);
          if (target) onOpenSubagent(target.key, target.description);
        }}
      />
      <div className="chat-composer subagent-composer">
        {agentId ? (
          <Composer
            busy={busy}
            placeholder={
              busy
                ? "メインのエージェントが作業中です。止めずに伝え、手が空いたところでこのサブエージェントに渡してもらいます"
                : "このサブエージェントに追加の指示（メインのエージェントから伝えます。Enter で送信）"
            }
            onSend={relay}
            onQueue={(text, attachments) => relay(text, attachments)}
          />
        ) : (
          <p className="muted small">このサブエージェントの ID が記録に残っていないため、追加の指示は送れません（以前のチャット）</p>
        )}
      </div>
    </div>
  );
}

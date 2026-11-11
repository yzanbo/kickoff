import { useState } from "react";
import type { Approval } from "@shared/types";
import { describeApprovalInput } from "@/features/chat/tools/toolDescribe";
import { QuestionCard } from "./QuestionCard";
import { useResolve } from "./useResolveApproval";
import { ErrorText } from "@/ui/ErrorText";
import { HighlightedCode } from "@/ui/HighlightedCode";
import { waitingSubagentKeys } from "@shared/chat/subagentState";
import { useSubagentsView } from "@/features/chat/subagents/subagentsContext";
import { agentHueStyle } from "@/features/chat/subagents/agentHues";
import { useOptionalChatPane } from "@/features/chat/pane/chatPaneContext";

/** ツール実行の承認依頼、AI からの質問（AskUserQuestion）、または通信の切断で何度再開しても続かなかったときの再開の確認 */
export function ApprovalCard({ approval }: { approval: Approval }) {
  if (approval.kind === "reconnect" || approval.kind === "usage_limit") return <ReconnectCard approval={approval} />;
  return (
    <>
      <ApprovalFrom approval={approval} />
      {approval.kind === "question" ? <QuestionCard approval={approval} /> : <PermissionCard approval={approval} />}
    </>
  );
}

/**
 * サブエージェントからの依頼なら、カードの上に「サブエージェント「調査」からの依頼」と添え、「開く」でそのサブエージェントを開く
 * （設定の開き方。どのサブエージェントが待っているかは waitingSubagentKeys。メインエージェントの依頼・チャットの画面の外では出さない）
 */
function ApprovalFrom({ approval }: { approval: Approval }) {
  const view = useSubagentsView();
  const pane = useOptionalChatPane();
  if (!view) return null;
  const [key] = waitingSubagentKeys([approval], view.events, [...view.tree.byKey.values()]);
  const entry = key === undefined ? undefined : view.tree.byKey.get(key);
  if (!entry) return null;
  return (
    <div className="approval-from small" style={agentHueStyle(view.hues.get(entry.key))}>
      <span className="agent-dot" aria-hidden />
      サブエージェント「{entry.description}」からの依頼
      {pane && (
        <button type="button" className="link-button" title="このサブエージェントを開く（設定の開き方で、流れの中のカードか右の欄）" onClick={() => pane.openSubagent(entry.key)}>
          開く
        </button>
      )}
    </div>
  );
}

/** 自動の再開を何度試しても続かなかった: 再開するか（もう一度「続けて」を送る）、やめるか（失敗のまま） */
/** 止まった作業を再開するかの確認（通信の切断で自動の再開が続かなかった・使用枠が戻った） */
function ReconnectCard({ approval }: { approval: Approval }) {
  const { sending, error, resolve } = useResolve(approval.id);
  const usage = approval.kind === "usage_limit";
  return (
    <div className="approval-card">
      <div className="approval-head">
        <span className="approval-badge reconnect-badge">{usage ? "使用枠" : "再開の確認"}</span>
        <span className="approval-title">{approval.title}</span>
      </div>
      {approval.description && <p className="muted small">{approval.description}</p>}
      <div className="approval-actions">
        <button className="btn btn-primary" disabled={sending} onClick={() => void resolve({ action: "allow" })}>
          再開する
        </button>
        <button className="btn" disabled={sending} onClick={() => void resolve({ action: "deny" })} title={
            usage
              ? "再開せずに止めたままにする（送信待ちも止めたまま。あとでメッセージを送ると、続きから再開します）"
              : "再開せずに止めたままにする（あとでメッセージを送ると、続きから再開します）"
          }>
          やめる
        </button>
      </div>
      <ErrorText message={error} />
    </div>
  );
}

function PermissionCard({ approval }: { approval: Approval }) {
  const { sending, error, resolve } = useResolve(approval.id);
  const [denying, setDenying] = useState(false);
  const [message, setMessage] = useState("");
  const description = typeof approval.input.description === "string" ? approval.input.description : approval.description;
  // チャットの AI の DB のツール（kickoff_db）の SQL（接続の名前は見出しにある）
  const dbSql = approval.tool_name === "mcp__kickoff_db__db_query" && typeof approval.input.sql === "string" ? approval.input.sql : null;

  return (
    <div className="approval-card">
      <div className="approval-head">
        <span className="approval-badge">承認待ち</span>
        <span className="approval-title">{approval.title ?? `${approval.tool_name} の実行`}</span>
      </div>
      {description && <p className="muted small">{description}</p>}
      <pre className="approval-command">
        {/* コマンドは、実行のあとの欄と同じくシェルの文法で色を付ける。AI が DB に流す SQL は、確かめられるよう切らずに全文を SQL の色で */}
        {dbSql !== null ? (
          <HighlightedCode code={dbSql} lang="sql" />
        ) : approval.tool_name === "Bash" ? (
          <HighlightedCode code={describeApprovalInput(approval.tool_name, approval.input)} lang="shellscript" />
        ) : (
          describeApprovalInput(approval.tool_name, approval.input)
        )}
      </pre>
      {denying ? (
        <div className="approval-deny">
          <input
            type="text"
            value={message}
            autoFocus
            placeholder="理由や代わりにしてほしいこと（任意）"
            onChange={(e) => setMessage(e.target.value)}
          />
          <button className="btn" disabled={sending} onClick={() => setDenying(false)}>
            戻る
          </button>
          <button className="btn btn-danger" disabled={sending} onClick={() => void resolve({ action: "deny", message: message.trim() || undefined })}>
            拒否する
          </button>
        </div>
      ) : (
        <div className="approval-actions">
          <button className="btn btn-primary" disabled={sending} onClick={() => void resolve({ action: "allow" })}>
            許可
          </button>
          {approval.can_remember && (
            <button className="btn" disabled={sending} onClick={() => void resolve({ action: "allow_always" })} title="同じ種類の操作を今後は確認しない">
              常に許可
            </button>
          )}
          <button className="btn" disabled={sending} onClick={() => setDenying(true)}>
            拒否…
          </button>
        </div>
      )}
      <ErrorText message={error} />
    </div>
  );
}

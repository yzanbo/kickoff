import "./ApprovalCard.css";
import { Suspense, useState } from "react";
import type { Approval } from "@shared/chat/approvalTypes";
import { REMEMBER_SCOPE_LABELS } from "@shared/ai/approvals";
import { toolText } from "@/features/chat/ui";
import { QuestionCard } from "./QuestionCard";
import { useResolve } from "./useResolveApproval";
import { ErrorText } from "@/foundation/ui/kit/ErrorText";
import { useSubagentsView } from "@/features/subagents/ui/subagentsContext";
import { agentHueStyle } from "@/features/subagents/ui/model/agentHues";
import { useOptionalSubagentNav } from "@/features/chat/ui";
import { toolRowViewOf } from "@/features/conversation/ui/tools/toolRowViews";

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
 * （設定の開き方。どのサブエージェントが待っているかはサブエージェントの取り出し口の askers。メインエージェントの依頼・チャットの画面の外では出さない）
 */
function ApprovalFrom({ approval }: { approval: Approval }) {
  const view = useSubagentsView();
  const subagents = useOptionalSubagentNav();
  if (!view) return null;
  const key = view.askers.get(approval.id);
  const entry = key === undefined ? undefined : view.tree.byKey.get(key);
  if (!entry) return null;
  return (
    <div className="approval-from small" style={agentHueStyle(view.hues.get(entry.key))}>
      <span className="agent-dot" aria-hidden />
      サブエージェント「{entry.description}」からの依頼
      {subagents && (
        <button type="button" className="link-button" title="このサブエージェントを開く（設定の開き方で、流れの中のカードか右の欄）" onClick={() => subagents.open(entry.key)}>
          開く
        </button>
      )}
    </div>
  );
}

/** 止まった作業を再開するかの確認（通信の切断で自動の再開が続かなかった・使用枠が戻った）: 再開する（もう一度「続けて」を送る）か、やめる（失敗のまま）か */
function ReconnectCard({ approval }: { approval: Approval }) {
  const { sending, error, resolve } = useResolve(approval.id);
  const usage = approval.kind === "usage_limit";
  return (
    <div className="approval-card card">
      <div className="approval-head">
        <span className="approval-badge tag reconnect-badge" data-look="solid">{usage ? "使用枠" : "再開の確認"}</span>
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
  const view = toolRowViewOf(approval.tool_name, approval.input);

  return (
    <div className="approval-card card">
      <div className="approval-head">
        <span className="approval-badge tag" data-look="solid">承認待ち</span>
        <span className="approval-title">{approval.title ?? toolText().toolLabel(approval.tool_name)}</span>
      </div>
      {description && <p className="muted small">{description}</p>}
      <pre className="approval-command">
        {/* 中身はツールの見せ方の表から（コマンドはシェルの文法の色・AI が DB に流す SQL は全文を SQL の色で） */}
        <Suspense fallback={toolText().describeApprovalInput(approval.tool_name, approval.input)}>
          {view?.ApprovalBody ? <view.ApprovalBody input={approval.input} name={approval.tool_name} /> : toolText().describeApprovalInput(approval.tool_name, approval.input)}
        </Suspense>
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
            <button className="btn" disabled={sending} onClick={() => void resolve({ action: "allow_always" })} title={REMEMBER_SCOPE_LABELS[approval.remember_scope ?? "rule"].title}>
              {REMEMBER_SCOPE_LABELS[approval.remember_scope ?? "rule"].label}
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

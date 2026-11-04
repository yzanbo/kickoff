import { useState } from "react";
import type { Approval } from "../../../../core/types";
import { describeApprovalInput } from "./toolDescribe";
import { QuestionCard } from "./QuestionCard";
import { useResolve } from "./useResolveApproval";
import { ErrorText } from "../ErrorText";

/** ツール実行の承認依頼、AI からの質問（AskUserQuestion）、または通信の切断で何度再開しても続かなかったときの再開の確認 */
export function ApprovalCard({ approval }: { approval: Approval }) {
  if (approval.kind === "question") return <QuestionCard approval={approval} />;
  if (approval.kind === "reconnect" || approval.kind === "usage_limit") return <ReconnectCard approval={approval} />;
  return <PermissionCard approval={approval} />;
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

  return (
    <div className="approval-card">
      <div className="approval-head">
        <span className="approval-badge">承認待ち</span>
        <span className="approval-title">{approval.title ?? `${approval.tool_name} の実行`}</span>
      </div>
      {description && <p className="muted small">{description}</p>}
      <pre className="approval-command">{describeApprovalInput(approval.tool_name, approval.input)}</pre>
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

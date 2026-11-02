import { useState } from "react";
import type { Approval, ApprovalDecision, Question } from "../../../../core/types";
import { api } from "../../api";
import { useActionError } from "../../hooks/useActionError";
import { isSubagentTool } from "./subagentList";
import { ErrorText } from "../ErrorText";

/** ツール実行の承認依頼、または AI からの質問（AskUserQuestion） */
export function ApprovalCard({ approval }: { approval: Approval }) {
  return approval.kind === "question" ? <QuestionCard approval={approval} /> : <PermissionCard approval={approval} />;
}

function useResolve(id: string) {
  // 送れたらカードごと消えるので、送信中のままにしておく（失敗したときだけ押し直せるようにする）
  const [sending, setSending] = useState(false);
  const { error, setError, guard } = useActionError();
  async function resolve(decision: ApprovalDecision) {
    setSending(true);
    setError(undefined);
    if (!(await guard(() => api.resolveApproval(id, decision)))) setSending(false);
  }
  return { sending, error, resolve };
}

/** ツールの入力を人が読める 1 行にする */
export function describeToolInput(toolName: string, input: Record<string, unknown>): string {
  if (toolName === "Bash" && typeof input.command === "string") return input.command;
  // サブエージェントは、依頼の概要と種類だけ（依頼の全文は「中身を見る」で見られる）
  if (isSubagentTool(toolName) && typeof input.description === "string") {
    return typeof input.subagent_type === "string" ? `${input.description}（${input.subagent_type}）` : input.description;
  }
  if (typeof input.file_path === "string") return input.file_path;
  if (typeof input.url === "string") return input.url;
  if (typeof input.query === "string") return input.query;
  if (typeof input.pattern === "string") return input.pattern;
  return JSON.stringify(input);
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
      <pre className="approval-command">{describeToolInput(approval.tool_name, approval.input)}</pre>
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

const OTHER = "__other__";

function QuestionCard({ approval }: { approval: Approval }) {
  const questions = (approval.input.questions as Question[] | undefined) ?? [];
  const { sending, error, resolve } = useResolve(approval.id);
  // 質問ごとに選んだラベル（"その他" は OTHER）と自由記述
  const [selected, setSelected] = useState<Record<string, string[]>>({});
  const [other, setOther] = useState<Record<string, string>>({});

  const toggle = (q: Question, label: string) =>
    setSelected((prev) => {
      const current = prev[q.question] ?? [];
      if (!q.multiSelect) return { ...prev, [q.question]: [label] };
      return { ...prev, [q.question]: current.includes(label) ? current.filter((l) => l !== label) : [...current, label] };
    });

  const answers: Record<string, string | string[]> = {};
  for (const q of questions) {
    const picked = (selected[q.question] ?? []).map((l) => (l === OTHER ? (other[q.question] ?? "").trim() : l)).filter(Boolean);
    if (picked.length > 0) answers[q.question] = q.multiSelect ? picked : picked[0];
  }
  const complete = questions.every((q) => answers[q.question] !== undefined);

  return (
    <div className="approval-card question-card">
      <div className="approval-head">
        <span className="approval-badge question">AI からの質問</span>
      </div>
      {questions.map((q) => (
        <fieldset key={q.question} className="question">
          <legend>
            <span className="question-header">{q.header}</span>
            {q.question}
          </legend>
          <div className="question-options">
            {q.options.map((o) => {
              const checked = (selected[q.question] ?? []).includes(o.label);
              return (
                <label key={o.label} className={`question-option ${checked ? "checked" : ""}`}>
                  <input
                    type={q.multiSelect ? "checkbox" : "radio"}
                    name={`${approval.id}:${q.question}`}
                    checked={checked}
                    onChange={() => toggle(q, o.label)}
                  />
                  <span>
                    <span className="question-label">{o.label}</span>
                    <span className="muted small">{o.description}</span>
                  </span>
                </label>
              );
            })}
            <label className={`question-option ${(selected[q.question] ?? []).includes(OTHER) ? "checked" : ""}`}>
              <input
                type={q.multiSelect ? "checkbox" : "radio"}
                name={`${approval.id}:${q.question}`}
                checked={(selected[q.question] ?? []).includes(OTHER)}
                onChange={() => toggle(q, OTHER)}
              />
              <span className="question-other">
                <span className="question-label">その他</span>
                <input
                  type="text"
                  value={other[q.question] ?? ""}
                  placeholder="自由に回答"
                  onFocus={() => !(selected[q.question] ?? []).includes(OTHER) && toggle(q, OTHER)}
                  onChange={(e) => setOther((prev) => ({ ...prev, [q.question]: e.target.value }))}
                />
              </span>
            </label>
          </div>
        </fieldset>
      ))}
      <div className="approval-actions">
        <button className="btn btn-primary" disabled={sending || !complete} onClick={() => void resolve({ action: "answer", answers })}>
          回答する
        </button>
        <button className="btn" disabled={sending} onClick={() => void resolve({ action: "deny", message: "ユーザーはこの質問をスキップしました。推測できる範囲で進めてください。" })}>
          スキップ
        </button>
      </div>
      <ErrorText message={error} />
    </div>
  );
}

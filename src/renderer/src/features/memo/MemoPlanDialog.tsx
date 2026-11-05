import { ArrowRight } from "lucide-react";
import { useState } from "react";
import type { MemoPlan } from "@shared/types";
import { errorMessage } from "@shared/errors";
import { api } from "@/api";
import { useEditKeys } from "@/hooks/useEditKeys";
import { useModalDialog } from "@/hooks/useModalDialog";
import { alertDialog } from "@/ui/dialogs";
import { DialogActions } from "@/ui/DialogActions";
import { ErrorText } from "@/ui/ErrorText";

/**
 * メモのタブの「AI でフォルダを整理」: 頼み（空ならおまかせ）→ AI の整理案（名前の変更・ほかのフォルダへの移動。理由つき）を、
 * チェックの一覧で見せる（初めはすべて選ぶ）→ 選んだものだけを動かす（onApply。消す・中身を書き換える案は出ない）。動かすまでメモは変わらない
 */
export function MemoPlanDialog({
  projectId,
  onApply,
  onClose,
}: {
  projectId: number;
  onApply: (moves: { from: string; to: string }[]) => Promise<{ moved: number; failed: string[] }>;
  onClose: () => void;
}) {
  const dialog = useModalDialog({ closeOnBackdrop: false });
  const [instruction, setInstruction] = useState("");
  const [plan, setPlan] = useState<MemoPlan | null>(null);
  const [chosen, setChosen] = useState<ReadonlySet<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const makePlan = async () => {
    if (busy) return;
    setBusy(true);
    setError(undefined);
    try {
      const next = await api.aiPlanMemos(projectId, instruction.trim() || null);
      setPlan(next);
      setChosen(new Set(next.moves.map((_, i) => i)));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const apply = async () => {
    if (!plan || busy) return;
    setBusy(true);
    const result = await onApply(plan.moves.filter((_, i) => chosen.has(i)));
    setBusy(false);
    dialog.close();
    if (result.failed.length > 0) await alertDialog(`${result.failed.length} 件は動かせませんでした`, result.failed.join("\n"));
  };

  const toggle = (i: number) => {
    const next = new Set(chosen);
    if (next.has(i)) next.delete(i);
    else next.add(i);
    setChosen(next);
  };
  const keys = useEditKeys({ onSubmit: () => void makePlan() });
  const moves = plan?.moves ?? [];
  const hasMoves = moves.length > 0;

  return (
    <dialog ref={dialog.ref} className="dialog app-dialog memo-plan-dialog" onClose={onClose}>
      <form
        className="app-dialog-body"
        onSubmit={(e) => {
          e.preventDefault();
          void (hasMoves ? apply() : makePlan());
        }}
      >
        <h2 className="app-dialog-title">AI でフォルダを整理</h2>
        {!hasMoves ? (
          <>
            <p className="app-dialog-message">
              {plan
                ? "整理する案はありませんでした。頼みを変えて、もう一度作れます。"
                : "メモの名前と書き出しを AI に見せて、フォルダ分けと名前の付け直しの案を作ります。案を見て、選んだものだけを動かします（消す・中身を書き換える案は出ません）。"}
            </p>
            <textarea
              autoFocus
              rows={2}
              value={instruction}
              placeholder="頼み（空ならおまかせ。例: 日付ごとのフォルダに分けて）。Enter で案を作る"
              onChange={(e) => setInstruction(e.target.value)}
              {...keys.keyProps}
            />
          </>
        ) : (
          <>
            <p className="app-dialog-message">
              {moves.length} 件の案があります。動かすものを選んでください。
              {(plan?.skipped ?? 0) > 0 && `（使えない案 ${plan?.skipped} 件は除きました）`}
            </p>
            <ul className="memo-plan-list">
              {moves.map((m, i) => (
                <li key={m.from}>
                  <label className="memo-plan-row">
                    <input type="checkbox" checked={chosen.has(i)} onChange={() => toggle(i)} />
                    <span className="memo-plan-paths">
                      <span className="memo-plan-from">{m.from}</span>
                      <ArrowRight size={12} aria-hidden />
                      <span className="memo-plan-to">{m.to}</span>
                    </span>
                    {m.reason && <span className="memo-plan-reason muted small">{m.reason}</span>}
                  </label>
                </li>
              ))}
            </ul>
          </>
        )}
        <ErrorText message={error} />
        <DialogActions
          className="app-dialog-actions"
          onCancel={dialog.close}
          submit={
            hasMoves
              ? { label: `選んだ ${chosen.size} 件を動かす`, busyLabel: "動かしています…", busy, disabled: chosen.size === 0 }
              : { label: plan ? "もう一度作る" : "案を作る", busyLabel: "AI が案を作っています…", busy }
          }
        >
          {hasMoves && (
            <button type="button" className="btn" disabled={busy} onClick={() => setPlan(null)}>
              頼みを変える
            </button>
          )}
        </DialogActions>
      </form>
    </dialog>
  );
}

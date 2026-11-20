import { ArrowRight } from "lucide-react";
import { useState } from "react";
import type { NotePlan } from "@shared/notes/types";
import { errorMessage } from "@shared/foundation/errors";
import { api } from "@/foundation/ui/api";
import { useEditKeys } from "@/foundation/ui/hooks/useEditKeys";
import { useModalDialog } from "@/foundation/ui/hooks/useModalDialog";
import { alertDialog } from "@/foundation/ui/kit/dialogs";
import { DialogActions } from "@/foundation/ui/kit/DialogActions";
import { ErrorText } from "@/foundation/ui/kit/ErrorText";

/**
 * ノートのタブの「AI でフォルダを整理」: 頼み（空ならおまかせ）→ AI の整理案（名前の変更・ほかのフォルダへの移動。理由つき）を、
 * チェックの一覧で見せる（初めはすべて選ぶ）→ 選んだものだけを動かす（onApply。消す・中身を書き換える案は出ない）。動かすまでノートは変わらない
 */
export function NotePlanDialog({
  projectId,
  onApply,
  onClose,
}: {
  projectId: number;
  onApply: (moves: { from: string; to: string }[]) => Promise<{ moved: number; failed: string[] }>;
  onClose: () => void;
}) {
  const { ref: dialogRef, ...dialog } = useModalDialog({ closeOnBackdrop: false });
  const [instruction, setInstruction] = useState("");
  const [plan, setPlan] = useState<NotePlan | null>(null);
  const [chosen, setChosen] = useState<ReadonlySet<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const makePlan = async () => {
    if (busy) return;
    setBusy(true);
    setError(undefined);
    const request = api.aiPlanNotes(projectId, instruction.trim() || null);
    await request.then(
      (next) => {
        setPlan(next);
        setChosen(new Set(next.moves.map((_, i) => i)));
      },
      (e: unknown) => setError(errorMessage(e)),
    );
    setBusy(false);
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
    <dialog ref={dialogRef} className="dialog app-dialog note-plan-dialog" onClose={onClose}>
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
                : "ノートの名前と書き出しを AI に見せて、フォルダ分けと名前の付け直しの案を作ります。案を見て、選んだものだけを動かします（消す・中身を書き換える案は出ません）。"}
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
            <ul className="note-plan-list">
              {moves.map((m, i) => (
                <li key={m.from}>
                  <label className="note-plan-row">
                    <input type="checkbox" checked={chosen.has(i)} onChange={() => toggle(i)} />
                    <span className="note-plan-paths">
                      <span className="note-plan-from">{m.from}</span>
                      <ArrowRight size={12} aria-hidden />
                      <span className="note-plan-to">{m.to}</span>
                    </span>
                    {m.reason && <span className="note-plan-reason muted small">{m.reason}</span>}
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

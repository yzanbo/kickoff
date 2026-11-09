import { TriangleAlert } from "lucide-react";
import type { GitConflictResolution, GitOperation, GitOperationAction, GitStatus } from "@shared/types";
import { GIT_OPERATION_LABELS } from "@shared/types";
import type { ActionState } from "@/hooks/useAction";
import { alertDialog, confirmDialog } from "@/ui/dialogs";
import type { CommitBusy } from "./CommitBox";
import type { GitStatusController } from "./useGitStatus";

/** 衝突したファイルの「こちら」「取り込む側」が、操作ごとに何を指すか（リベースでは git の ours が土台のブランチになる） */
const SIDES: Record<GitOperation, { ours: string; theirs: string }> = {
  merge: { ours: "いまのブランチの版", theirs: "取り込むブランチの版" },
  rebase: { ours: "土台のブランチの版", theirs: "付け直しているコミットの版" },
  "cherry-pick": { ours: "いまのブランチの版", theirs: "取り込むコミットの版" },
  revert: { ours: "いまのブランチの版", theirs: "打ち消すコミットの前の版" },
};

/**
 * 変更タブの上の「マージ中」などの帯（途中で止まっている操作を取りやめる・続ける・飛ばす）。
 * 衝突したファイルごとに、こちらの版・取り込む側の版を使う・いまの中身で解決済みにする（ファイルを開いて印の行を直してから解決済みにもできる）
 */
export function OperationBanner({ status, git, action }: { status: Extract<GitStatus, { repo: true }>; git: GitStatusController; action: ActionState<CommitBusy> }) {
  const operation = status.operation;
  if (!operation) return null;
  const label = GIT_OPERATION_LABELS[operation];
  const sides = SIDES[operation];
  const conflicts = status.conflicts;
  const canSkip = operation !== "merge";

  const operate = (how: GitOperationAction) =>
    action.guard(async () => {
      if (how === "abort" && !(await confirmDialog({ title: `${label}を取りやめる`, message: `${label}の前の状態に戻します。解いた中身も元に戻ります。`, confirmLabel: "取りやめる", danger: true }))) return;
      const next = await git.operate(how);
      // 続けた先（リベースの次のコミットなど）でまた衝突した
      if (next.length > 0) await alertDialog(`${label}の続きでも衝突しました（${next.length} 件）`, "衝突したファイルを解決済みにしてから、もう一度「続ける」を押してください。");
    });
  const resolve = (path: string, how: GitConflictResolution) => action.guard(() => git.resolve(path, how));

  return (
    <section className="operation-banner" aria-label={`${label}の途中`}>
      <div className="operation-banner-head">
        <TriangleAlert size={14} aria-hidden />
        <span className="operation-banner-title">
          {label}の途中です{conflicts.length > 0 ? `（衝突 ${conflicts.length} 件）` : ""}
        </span>
      </div>
      <p className="operation-banner-note">
        {conflicts.length > 0
          ? "衝突したファイルを直して解決済みにしてから「続ける」を押してください。"
          : `衝突はすべて解決しました。「続ける」で${label}を終えます。`}
      </p>
      {conflicts.length > 0 && (
        <ul className="operation-conflicts">
          {conflicts.map((c) => (
            <li key={c.path}>
              <span className="operation-conflict-path" title={c.path}>
                {c.path}
              </span>
              <button className="btn btn-sm" title={`${sides.ours}を使う`} onClick={() => void resolve(c.path, "ours")}>
                こちら
              </button>
              <button className="btn btn-sm" title={`${sides.theirs}を使う`} onClick={() => void resolve(c.path, "theirs")}>
                取り込む側
              </button>
              <button className="btn btn-sm" title="いまの中身（印の行を直したもの）で解決済みにする" onClick={() => void resolve(c.path, "mark")}>
                解決済み
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="operation-banner-actions">
        <button className="btn btn-sm" onClick={() => void operate("abort")}>
          取りやめる
        </button>
        {canSkip && (
          <button className="btn btn-sm" title="ぶつかったコミットを飛ばして、残りを続けます" onClick={() => void operate("skip")}>
            スキップ
          </button>
        )}
        <button
          className="btn btn-sm btn-primary"
          disabled={conflicts.length > 0}
          title={conflicts.length > 0 ? "衝突しているファイルを解決済みにしてから" : undefined}
          onClick={() => void operate("continue")}
        >
          続ける
        </button>
      </div>
    </section>
  );
}

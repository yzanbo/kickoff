import { ChipPicker } from "@/ui/ChipPicker";
import { promptDialog } from "@/ui/dialogs";
import { useWorktrees } from "@/stores/worktrees";
import { workplaceHue } from "./workplaceHue";
import { worktreeLabel } from "./WorktreePicker";
import { WORKPLACE_SHORT_LABELS } from "./workplace";

/** 新しいチャットの作業場所（本体・いまあるワークツリー・新しく作るワークツリー） */
export type Workplace = { kind: "main" } | { kind: "existing"; path: string } | { kind: "new"; branch: string };

/** 作業場所のフォルダ（チャットの worktree_path と同じ形。null = 本体、undefined = 新しく作るワークツリーで、まだない） */
export const workplacePath = (place: Workplace): string | null | undefined => (place.kind === "existing" ? place.path : place.kind === "main" ? null : undefined);

const NEW = "__new__";

/** 新しいワークツリーのブランチ名を聞く（作業場所の選択と、作業中の作業場所に送るときの確かめで共通）。やめたら null */
export function askNewWorktreeBranch(): Promise<string | null> {
  return promptDialog({
    title: "新しいワークツリーで始める",
    message: "いまのコミットから新しいブランチを作り、別のフォルダで作業します。ほかのチャットと並行して進めても、ファイルがぶつかりません（本体の node_modules も写すので、すぐ動かせます）。",
    label: "ブランチの名前",
    placeholder: "例: feature/login",
    confirmLabel: "決める",
  });
}

/**
 * 新しいチャットの作業場所とブランチを選ぶ（並行開発のため、チャットごとに別のワークツリーで作業させられる）。
 * 見た目はチャットの見出しのブランチの印（WorktreeChip）と同じ札（作業場所の色・「本体｜main」「WT｜ブランチ名」）に ▾ を付けたもの。
 * 「新しいワークツリー…」を選ぶとブランチ名を聞き、チャットを始めるときに作る
 */
export function WorkplacePicker({ projectId, value, onChange }: { projectId: number; value: Workplace; onChange: (place: Workplace) => void }) {
  const worktrees = useWorktrees(projectId);
  if (!worktrees || worktrees.length === 0) return null;
  const current = value.kind === "existing" ? value.path : value.kind === "new" ? NEW : "";
  const listed = worktrees.find((w) => (w.main ? "" : w.path) === current);

  const choose = async (next: string) => {
    if (next !== NEW) return onChange(next ? { kind: "existing", path: next } : { kind: "main" });
    const branch = await askNewWorktreeBranch();
    if (branch) onChange({ kind: "new", branch });
  };

  // 選択肢（印と同じく作業場所を先に出し、ブランチを添える）と、いちばん下に新しいワークツリー
  const kindOf = (main: boolean) => WORKPLACE_SHORT_LABELS[main ? "main" : "worktree"];
  const values = [...worktrees.map((w) => (w.main ? "" : w.path)), NEW];
  const labels: Record<string, string> = Object.fromEntries(worktrees.map((w) => [w.main ? "" : w.path, `${kindOf(w.main)}｜${worktreeLabel(w)}`]));
  labels[NEW] = value.kind === "new" ? `新しい WT｜${value.branch}` : "＋ 新しいワークツリー…";
  const kind = value.kind === "new" ? "新しい WT" : kindOf(!listed || listed.main);
  const name = value.kind === "new" ? value.branch : listed ? worktreeLabel(listed) : "";
  return (
    <ChipPicker
      className="worktree-chip"
      hue={workplaceHue(projectId, { key: value.kind === "new" ? `new:${value.branch}` : current }, worktrees)}
      kind={kind}
      name={name}
      tip={`作業場所: ${value.kind === "new" ? "新しいワークツリー" : listed && !listed.main ? "ワークツリー" : "本体"}${name ? `（ブランチ: ${name}）` : ""}（押すと選び直す）`}
      menuTitle="作業場所とブランチ"
      values={values}
      labels={labels}
      value={current}
      onPick={(next) => void choose(next)}
    />
  );
}

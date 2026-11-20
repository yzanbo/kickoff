import { useState } from "react";
import type { Chat } from "@shared/chat/types";
import { api } from "@/foundation/ui/api";
import { useWorktreeEnv, useWorktrees } from "@/foundation/ui/workplace/worktreesStore";
import { ChipPicker } from "@/foundation/ui/kit/ChipPicker";
import { WorktreePrMark } from "@/features/github/ui/prNotice/PrNoticeMark";
import { useChatWorkplace } from "@/foundation/ui/workplace/useWorkplace";
import { WORKPLACE_SHORT_LABELS } from "@/foundation/ui/workplace/workplace";
import { worktreeEnvLines } from "@/features/worktrees/ui/worktreeEnvText";
import { askNewWorktreeBranch } from "@/foundation/ui/workplace/WorkplacePicker";
import type { WorkplaceChoice } from "@/foundation/ui/workplace/workplace";
import { worktreeLabel } from "@/foundation/ui/workplace/WorktreePicker";
import { moveChatWorkplace, workplaceMoveBlock } from "./moveWorkplace";
import { WorktreeChip } from "@/foundation/ui/workplace/WorktreeChip";

const NEW = "__new__";

/** 作業場所を移す先の選択肢（本体・いまあるワークツリー・新しいワークツリー。値は本体 ""・ワークツリーのフォルダ・NEW） */
export function useWorkplaceChoices(chat: Pick<Chat, "project_id" | "worktree_path">, reserved: readonly string[] = []) {
  const worktrees = useWorktrees(chat.project_id);
  const usable = (worktrees ?? []).filter((w) => !w.prunable);
  const values = [...usable.map((w) => (w.main ? "" : w.path)), NEW];
  const kindOf = (main: boolean) => WORKPLACE_SHORT_LABELS[main ? "main" : "worktree"];
  const labels: Record<string, string> = Object.fromEntries(usable.map((w) => [w.main ? "" : w.path, `${kindOf(w.main)}｜${worktreeLabel(w)}`]));
  labels[NEW] = "＋ 新しいワークツリー…";
  // いまの場所と、片付けを予約したワークツリーは選べない
  const current = chat.worktree_path ?? "";
  const disabled: Record<string, string> = { [current]: "いまの作業場所です" };
  for (const path of reserved) disabled[path] = "片付けを予約しているワークツリーなので、移す先にできません";
  /** 選んだ値を作業場所にする（新しいワークツリーはブランチ名を聞く。やめたら null）と、確かめの見出しの呼び名 */
  const resolve = async (value: string): Promise<{ place: WorkplaceChoice; label?: string } | null> => {
    if (value === NEW) {
      const branch = await askNewWorktreeBranch(chat.project_id);
      return branch ? { place: { kind: "new", branch } } : null;
    }
    const w = usable.find((x) => (x.main ? "" : x.path) === value);
    if (!w) return null;
    return w.main ? { place: { kind: "main" } } : { place: { kind: "existing", path: w.path }, label: worktreeLabel(w) };
  };
  return { available: worktrees !== undefined && usable.length > 0, values, labels, disabled, current, resolve };
}

/**
 * チャットの見出しの作業場所の札: 見た目は WorktreeChip のまま ▾ を付け、押すと移す先を選ぶ。
 * 作業中・実行環境を整えるチャットは押せない（理由を説明に）。ワークツリーの一覧がない（Git でない）プロジェクトは押せない札のまま
 */
export function WorkplaceMoveChip({ chat }: { chat: Chat }) {
  const { place, hue } = useChatWorkplace(chat);
  const envLines = worktreeEnvLines(useWorktreeEnv(chat.project_id, chat.worktree_path));
  // 片付けを予約したワークツリー（開いたときに読み直す）
  const [reserved, setReserved] = useState<string[]>([]);
  const choices = useWorkplaceChoices(chat, reserved);
  if (!place.name || !choices.available) return <WorktreeChip chat={chat} />;
  const block = workplaceMoveBlock(chat);
  return (
    <>
      <ChipPicker
        className={place.kind === "missing" ? "worktree-chip is-gone" : "worktree-chip"}
        hue={hue}
        kind={WORKPLACE_SHORT_LABELS[place.kind]}
        name={place.name}
        tip={[place.title, ...envLines, "押すと作業場所を変えられます（会話はそのまま続きます）"].join("\n")}
        menuTitle="作業場所を変更"
        values={choices.values}
        labels={choices.labels}
        value={choices.current}
        disabled={choices.disabled}
        inactive={block}
        onOpen={() => void api.workplaceCheck(chat.id).then((c) => setReserved(c.reserved), () => {})}
        onPick={(value) =>
          void choices.resolve(value).then((picked) => {
            if (picked) void moveChatWorkplace(chat, picked.place, picked.label);
          })
        }
      />
      <WorktreePrMark worktree={chat.worktree_path} />
    </>
  );
}

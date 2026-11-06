import { GitBranch } from "lucide-react";
import type { CSSProperties } from "react";
import type { Chat } from "@shared/types";
import { cx } from "@/lib/cx";
import { useChatWorkplace } from "./useWorkplace";

/**
 * チャットが作業しているブランチの印（すべてのチャットに出す）。色は作業場所ごとの色（workplaceHue）で、タブを作業場所別にまとめたときの
 * まとまりの色と同じ（本体も色を付ける）。ワークツリーのフォルダが見つからない・片付けて本体に戻ったチャットは、最後に作業したブランチを点線の枠で出す（説明に理由）
 */
export function WorktreeChip({ chat }: { chat: Pick<Chat, "project_id" | "worktree_path" | "branch"> }) {
  const { place, hue } = useChatWorkplace(chat);
  if (!place.name) return null;
  return (
    <span
      className={cx("worktree-chip", (place.kind === "missing" || place.kind === "past") && "is-gone")}
      style={{ "--group-hue": hue } as CSSProperties}
      title={place.title}
    >
      <GitBranch size={11} aria-hidden />
      {place.name}
    </span>
  );
}

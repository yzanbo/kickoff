import type { CSSProperties } from "react";
import type { Chat } from "@shared/types";
import { cx } from "@/lib/cx";
import { useChatWorkplace } from "./useWorkplace";
import { WORKPLACE_SHORT_LABELS } from "./workplace";

/**
 * チャットの作業場所とブランチの印（すべてのチャットに出す）。「本体｜main」「WT｜ブランチ名」のように、作業場所（本体・ワークツリー）を先に出し、
 * ブランチ名は区切りの後ろに補足として少し薄く出す（狭いときはブランチ名だけを省く）。色は作業場所ごとの色（workplaceHue）で、タブを作業場所別に
 * まとめたときのまとまりの色と同じ（本体も色を付ける）。ワークツリーのフォルダが見つからない・片付けて本体に戻ったチャットは、最後に作業したブランチを
 * 点線の枠で出す（説明に理由）。Git でない本体（ブランチがない）は出さない
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
      <span className="chip-kind">{WORKPLACE_SHORT_LABELS[place.kind]}</span>
      <span className="chip-name">{place.name}</span>
    </span>
  );
}

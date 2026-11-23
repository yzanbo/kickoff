import "@/foundation/ui/kit/ChipPicker.css";
import "./WorktreeChip.css";
import type { CSSProperties } from "react";
import type { Chat } from "@shared/chat/types";
import { cx } from "@/foundation/ui/lib/cx";
import { useWorktrees } from "./worktreesStore";
import { useChatWorkplace } from "./useWorkplace";
import { WORKPLACE_SHORT_LABELS, type WorkplaceChat } from "./workplace";
import { WorkplaceMarks, workplaceDecorLines } from "./workplaceDecor";

/**
 * チャットの作業場所とブランチの印（すべてのチャットに出す）。「本体｜main」「WT｜ブランチ名」のように、作業場所（本体・ワークツリー）を先に出し、
 * ブランチ名は区切りの後ろに補足として少し薄く出す（狭いときはブランチ名だけを省く）。色は作業場所ごとの色（workplaceHue）で、タブを作業場所別に
 * まとめたときのまとまりの色と同じ（本体も色を付ける）。ワークツリーのフォルダが見つからない・片付けて本体に戻ったチャットは、最後に作業したブランチを
 * 点線の枠で出す（説明に理由）。Git でない本体（ブランチがない）は出さない。
 * 札の後ろの印（PR がマージされた・閉じられた印。狭い所は markIconOnly でアイコンだけ）と、乗せたときの説明に添える行（実行環境のアプリの URL と
 * ポートの対応表）は、作業場所の飾り（workplaceDecor）に持ち主の機能が登録したもの
 */
export function WorktreeChip({ chat, markIconOnly }: { chat: WorkplaceChat & Pick<Chat, "project_id">; markIconOnly?: boolean }) {
  const { place, hue } = useChatWorkplace(chat);
  const decorLines = workplaceDecorLines(chat.project_id, chat.worktree_path, useWorktrees(chat.project_id));
  if (!place.name) return null;
  return (
    <>
      <span
        className={cx("worktree-chip tag", place.kind === "missing" && "is-gone")}
        data-look="outline"
        style={{ "--hue": hue } as CSSProperties}
        title={[place.title, ...decorLines].join("\n")}
      >
        <span className="chip-kind">{WORKPLACE_SHORT_LABELS[place.kind]}</span>
        <span className="chip-name">{place.name}</span>
      </span>
      <WorkplaceMarks projectId={chat.project_id} path={chat.worktree_path} iconOnly={markIconOnly} />
    </>
  );
}

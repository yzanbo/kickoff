import { Wrench } from "lucide-react";
import type { CiRun } from "@shared/types";
import { MenuItem } from "@/ui/PopupMenu";
import { HandOffButton } from "@/features/chat/handoff/HandOffMenu";
import { ciHandOffItem, fixCiRun } from "./ciHandoff";

/**
 * 落ちた実行の「AI に渡す ▾」: いちばん上に「（ブランチ名）で直す」（そのブランチの作業場所のチャットへ。既定のブランチなら本体）、
 * 区切り線の下に共通の 4 つの渡し先。どれも入力欄に入れるだけで、送るのは自分で
 */
export function CiHandoffMenu({ projectId, run, repo, defaultBranch }: { projectId: number; run: CiRun; repo: string; defaultBranch: string | null }) {
  const branch = run.branch;
  const lead = branch && (
    <>
      <MenuItem
        title={
          branch === defaultBranch
            ? `本体（${branch}）で作業しているチャットの入力欄に、落ちたステップのログの札を入れる（チャットがなければ本体で新しく始める）`
            : `${branch} のワークツリー（なければ作る）で作業しているチャットの入力欄に、落ちたステップのログの札を入れる（チャットがなければ新しく始める）`
        }
        onSelect={() => void fixCiRun(projectId, run, repo)}
      >
        <Wrench size={14} /> {branch} で直す
      </MenuItem>
      <div className="menu-separator" role="separator" />
    </>
  );
  return <HandOffButton item={ciHandOffItem(projectId, run, repo, defaultBranch)} lead={lead} className="ci-handoff-button" />;
}

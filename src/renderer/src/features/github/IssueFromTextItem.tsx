import { CircleDot } from "lucide-react";
import { MenuItem } from "@/ui/PopupMenu";
import { openNewIssue } from "./githubDialogs";

/**
 * 右クリックのメニューの「issue にする」（メモの本文・チャットの発言。要件 5.11 の段階 3・決定 ⑨）: 選んだ文（なければ全体）を本文に入れた新しい issue のダイアログを開く
 * （作る前に題名を付け、本文を直せる）。GitHub タブと同じく、この Mac のアプリの中だけ出す
 */
export function IssueFromTextItem({ projectId, body }: { projectId: number; body: () => string }) {
  if (!window.kickoff) return null;
  return (
    <MenuItem title="選んだ文（選んでいなければ全体）を本文にして、GitHub に新しい issue を作ります（作る前に直せます）" onSelect={() => openNewIssue(projectId, { body: body() })}>
      <CircleDot size={14} /> issue にする
    </MenuItem>
  );
}

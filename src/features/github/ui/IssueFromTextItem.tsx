import { CircleDot } from "lucide-react";
import { MenuItem } from "@/foundation/ui/kit/PopupMenu";
import { openNewIssue } from "./NewIssueDialog";

/**
 * 右クリックのメニューの「issue にする」（ノートの本文・チャットの発言）: 選んだ文（なければ全体）を本文に入れた新しい issue のダイアログを開く
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

/** 発言の右クリックの「issue にする」（会話の画面の messageActions に登録する形。text は選んだ部分、なければ発言の全体） */
export function IssueFromMessageItem({ projectId, text }: { projectId: number; text: string }) {
  return <IssueFromTextItem projectId={projectId} body={() => text} />;
}

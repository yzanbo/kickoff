// 作業場所を移した区切り（記録の workplace_moved）の 1 行と AI への知らせ。区切りの一覧・そのときの作業場所・呼び名は @shared/chat/workplaceBoundaries。
// コア（AI への知らせ）と画面（区切りの 1 行）とスマホで同じものを使う
import type { ChatEventDataOf, WorkplaceMoveReason, WorkplaceRef } from "@shared/chat/chatEvent";
import { TRASH_KEEP_DAYS } from "@shared/trash/types";
import { folderName, workplaceLabel } from "@shared/chat/workplaceBoundaries";

type MoveData = ChatEventDataOf<"workplace_moved">;

/** 理由の頭（会話の区切りの 1 行） */
const REASON_HEADS: Record<WorkplaceMoveReason, string> = {
  user: "作業場所を移しました",
  ai: "AI が作業場所を移しました",
  worktree_finished: "ワークツリーを片付けたので、作業場所を本体に移しました",
  project_moved: "チャットを別のプロジェクトへ移したので、作業場所が変わりました",
  folder_moved: "プロジェクトのフォルダを変えたので、作業フォルダが変わりました",
};

/**
 * 移った先と元（フォルダの付け替えは、同じ作業場所のままフォルダだけが変わるのでパスで書く）。
 * 別のプロジェクトへ移したときは、どちらも「本体」になりうるので、フォルダの名前を添える（「本体（app） → 本体（site）」）
 */
function fromTo(data: MoveData): string {
  if (data.reason === "folder_moved") return `${data.from.dir} → ${data.to.dir}`;
  const named = data.from.project_id !== data.to.project_id;
  const side = (ref: WorkplaceRef) => (named ? `${workplaceLabel(ref)}（${folderName(ref.dir)}）` : workplaceLabel(ref));
  return `${side(data.from)} → ${side(data.to)}`;
}

/** 会話の区切りの 1 行（画面・スマホ） */
export function workplaceMoveLine(data: MoveData): string {
  const notes: string[] = [];
  if (data.carried) notes.push("コミットしていない変更も持っていきました");
  if (data.backed_up) notes.push(`コミットしていない変更は控えに入れました。${TRASH_KEEP_DAYS} 日はゴミ箱から戻せます`);
  notes.push(...situationNotes(data));
  return `${REASON_HEADS[data.reason]}: ${fromTo(data)}${notes.length ? `（${notes.join("。")}）` : ""}`;
}

/** 移したときのまわりの様子（片付けを先にした・元の場所で動いているもの・移した先で作業中のチャット。会話の 1 行と AI への知らせで同じ） */
function situationNotes(data: MoveData): string[] {
  const notes: string[] = [];
  if (data.after_finish) notes.push("先にワークツリーを片付けてから移しました");
  if (data.running?.length) notes.push(`元の作業場所で動いているもの（${data.running.join("、")}）は止めずに残しました`);
  if (data.busy) notes.push(`移した先では、ほかのチャット ${data.busy} 件が作業中です（同じファイルを書き換えるとぶつかることがあります）`);
  return notes;
}

/** 理由の言葉（AI への知らせ） */
const REASON_WORDS: Record<WorkplaceMoveReason, string> = {
  user: "利用者が移しました",
  ai: "あなたが操作ツールで頼んだとおり Kickoff が移しました",
  worktree_finished: "ワークツリーを片付けたので本体に戻りました",
  project_moved: "チャットを別のプロジェクトへ移しました",
  folder_moved: "プロジェクトのフォルダが変わりました",
};

/** コミットしていない変更がどうなったか（AI への知らせ） */
function changesNote(data: MoveData): string {
  if (data.carried) return "元の作業場所のコミットしていない変更は、移した先に持ってきました（元の場所からは消えています）。";
  if (data.backed_up) return "ワークツリーのコミットしていない変更は控えに入れました（利用者がゴミ箱から戻せます）。";
  if (data.reason === "user" || data.reason === "ai") return "元の作業場所のコミットしていない変更は元の場所に残っていて、移した先にはありません。";
  return "";
}

/**
 * 移したあと最初に送るものに 1 回だけ添える、移動の知らせ（指示に添える文脈で渡し、利用者の発言の文には混ぜない）。
 * 前の会話に出てきたパスは元の作業場所のものであること・読み書きはいまの作業フォルダで行うことを伝える
 */
export function workplaceMoveNote(data: MoveData): string {
  return [
    `作業場所が変わりました（${REASON_WORDS[data.reason]}）: ${workplaceLabel(data.from)}（${data.from.dir}）→ ${workplaceLabel(data.to)}（${data.to.dir}）。`,
    `これより前の会話に出てきたパス・ファイルの中身は元の作業場所のものです。ファイルの読み書きとコマンドは、いまの作業フォルダ（${data.to.dir}）で行ってください。`,
    changesNote(data),
    ...situationNotes(data).map((n) => `${n}。`),
  ]
    .filter(Boolean)
    .join("\n");
}

// 作業場所を移した区切り（記録の workplace_moved）の一覧と、その記録のときの作業場所・呼び名。
// 区切りの記録は chat のもの（巻き戻しの決まりは ./boundaries.ts）。画面のファイルのチップ・変更カード・読んだ画像と、区切りの 1 行（workplaceMove）が同じものを使う
import type { ChatEvent, ChatEventOf, WorkplaceRef } from "./chatEvent";

/** 作業場所のうち、どこを開くかを決める所（プロジェクトとワークツリー。本体なら null） */
export interface WorkplacePlace {
  project_id: number;
  worktree_path: string | null;
}

/** 区切り（記録の ID と、移す前の作業場所）。記録の ID の順 */
export interface WorkplaceBoundary {
  id: number;
  from: WorkplacePlace;
  /** 移す前の作業場所の呼び名（「本体」「ワークツリー（feat/x）」。開けないときの文） */
  fromLabel: string;
}

/** 記録の区切りの一覧（ID の順。画面は記録が変わるたびに作り直さず、これを覚えて workplaceAtBoundaries に渡す） */
export function workplaceBoundaries(events: readonly ChatEvent[]): WorkplaceBoundary[] {
  const out: WorkplaceBoundary[] = [];
  for (const e of events) {
    if (e.type !== "workplace_moved") continue;
    const from = e.data.from;
    out.push({ id: e.id, from: { project_id: from.project_id, worktree_path: from.worktree_path }, fromLabel: workplaceLabel(from) });
  }
  return out.sort((a, b) => a.id - b.id);
}

/** いちばん新しい区切り（なければ null） */
export function latestWorkplaceMove(events: readonly ChatEvent[]): ChatEventOf<"workplace_moved"> | null {
  let latest: ChatEventOf<"workplace_moved"> | null = null;
  for (const e of events) if (e.type === "workplace_moved" && (!latest || e.id > latest.id)) latest = e;
  return latest;
}

/** 区切りの一覧から、その記録のときの作業場所（後ろにある最初の区切りの「移す前」。区切りが後ろになければいまの作業場所） */
function workplaceAtBoundaries(boundaries: readonly WorkplaceBoundary[], eventId: number, current: WorkplacePlace): WorkplacePlace & { moved: boolean } {
  for (const b of boundaries) if (b.id > eventId) return { ...b.from, moved: true };
  return { ...current, moved: false };
}

/** その記録のときの作業場所（ファイルのチップ・変更カード・読んだ画像を開く所） */
export function workplaceAt(events: readonly ChatEvent[], eventId: number, current: WorkplacePlace): WorkplacePlace & { moved: boolean } {
  return workplaceAtBoundaries(workplaceBoundaries(events), eventId, current);
}

/** 区切りより前の発言のファイル・画像を、そのときの作業場所がもうなくて開けないときの文 */
export const workplaceGoneText = (label: string): string => `この発言のときの作業場所（${label}）はもうないので開けません`;

/** フォルダのパスの最後の名前（末尾の / は外す） */
export const folderName = (p: string) => p.replace(/\/+$/, "").split("/").pop() || p;

/** 作業場所の呼び名（「本体」「ワークツリー（feat/x）」） */
export function workplaceLabel(ref: Pick<WorkplaceRef, "worktree_path" | "branch">): string {
  if (ref.worktree_path === null) return "本体";
  return `ワークツリー（${ref.branch ?? folderName(ref.worktree_path)}）`;
}


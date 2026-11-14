// ワークツリーの後始末の結果の文（純粋な関数。AI に返す文とチャットのお知らせで同じものを使う。メモの仕様書「0019_AI の操作ツールの追加」の F）

/** 取り込み済みか（ローカルで本体のブランチに入っている / GitHub で PR がマージ済み / どちらでもない = null） */
export type MergeState = { via: "local"; into: string } | { via: "github"; pr: number } | null;

/** 消す前に確かめたこと */
export interface FinishFacts {
  branch: string | null;
  /** コミットしていない変更のファイルの数 */
  changes: number;
  merged: MergeState;
  /** 本体のブランチに入っていないコミットの数（GitHub でマージ済みなら数えない） */
  unmerged: number;
}

/** 後始末でしたこと */
export interface FinishOutcome extends FinishFacts {
  /** 控えに入れたゴミ箱の ID（失うものがなければ null） */
  trashId: string | null;
  /** Docker のデータ: 消した / 組の名前を共有しているので残した / なし */
  docker: "removed" | "kept_shared" | "none";
  /** リモートのブランチ（消した名前・消せなかった理由。消さなかったら null） */
  remote: { name: string; error: string | null } | null;
  /** 本体に戻したチャットの数 */
  chats: number;
}

/** 取り込み済みの書き方（「ローカル」「GitHub の PR #12」） */
export const mergedText = (merged: Exclude<MergeState, null>) => (merged.via === "local" ? `ローカル（${merged.into}）` : `GitHub の PR #${merged.pr}`);

/** 消すと失うもの（取り込んでいないコミット・コミットしていない変更）の文。なければ null */
export function lossText(facts: FinishFacts): string | null {
  const parts = [...(facts.merged === null && facts.unmerged > 0 ? [`取り込んでいないコミット ${facts.unmerged} 個`] : []), ...(facts.changes > 0 ? [`変更 ${facts.changes} ファイル`] : [])];
  return parts.length > 0 ? parts.join("・") : null;
}

/** 消す前に確かめた結果の文（予約したときに AI に返す） */
export function plannedText(facts: FinishFacts): string {
  const name = facts.branch ? `ブランチ ${facts.branch}` : "ブランチなし";
  const loss = lossText(facts);
  const merged = facts.merged ? `取り込み済み（${mergedText(facts.merged)}）です。` : "まだ本体に取り込まれていません。";
  return `${name} は${merged}${loss ? `${loss}は控えに入れてから消し、3 日間は Kickoff のゴミ箱から戻せます。` : "失うものはありません。"}`;
}

/** 後始末の結果の文（AI に返す文とチャットのお知らせ） */
export function finishedText(o: FinishOutcome): string {
  const name = o.branch ? `ワークツリー（ブランチ ${o.branch}）` : "ワークツリー";
  const loss = lossText(o);
  const lines: string[] = [];
  if (o.merged && !loss) lines.push(`取り込み済み（${mergedText(o.merged)}）の${name}を片付けました。`);
  else if (o.merged) lines.push(`取り込み済み（${mergedText(o.merged)}）の${name}を片付けました。${loss}を控えに入れて消しました。3 日間はゴミ箱から戻せます。`);
  else if (loss) lines.push(`${name}を片付けました。${loss}を控えに入れて消しました。3 日間はゴミ箱から戻せます。`);
  else lines.push(`${name}を片付けました（失うものはありませんでした）。`);
  if (o.docker === "removed") lines.push("Docker のコンテナとデータ（ボリューム）も消しました（戻せません）。");
  if (o.docker === "kept_shared") lines.push("Docker の組の名前を本体などと共有しているので、Docker のデータは消さずに残しました。");
  if (o.remote && o.remote.error === null) lines.push(`リモートのブランチ（${o.remote.name}）も消しました。`);
  if (o.remote && o.remote.error !== null) lines.push(`リモートのブランチ（${o.remote.name}）は消せませんでした（${o.remote.error}）。`);
  if (o.chats > 0) lines.push(`このワークツリーで作業していたチャット ${o.chats} 件は、次から本体で動きます。`);
  return lines.join("\n");
}

/** 本体に戻したチャットに残すお知らせ */
export const movedToMainNotice = (branch: string | null) => `ワークツリー（${branch ?? "ブランチなし"}）を片付けました。次からは本体で動きます`;

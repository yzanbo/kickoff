// コミットしていない変更を、作業場所から新しいワークツリーへ持っていく。
// git stash を使う: まだ Git にないファイルも持っていき（-u）、Git で無視しているものは持っていかず、ステージしたかどうかも保つ（apply --index）。
// stash の一覧はリポジトリのすべての作業場所で共有なので、印（メッセージ）と中身の ID で自分の項目を見分け、位置（stash@{n}）を決め打ちしない
import { randomUUID } from "node:crypto";
import { gitOutput } from "./exec";

/** 持っていく途中の変更（stash の項目の ID と、見分ける印） */
export interface CarriedChanges {
  sha: string;
  tag: string;
}

/**
 * dir（プロジェクトのフォルダ。リポジトリの中のフォルダならその中だけ）のコミットしていない変更を stash に入れ、作業ツリーから外す。
 * 変更がなければ null
 */
export async function stashForCarry(dir: string): Promise<CarriedChanges | null> {
  const status = await gitOutput(dir, ["status", "--porcelain", "--untracked-files=all", "--", "."]);
  if (!status.trim()) return null;
  const tag = `kickoff-carry-${randomUUID()}`;
  await gitOutput(dir, ["stash", "push", "--include-untracked", "-m", tag, "--", "."], [], 120_000);
  const sha = await findStash(dir, tag);
  if (!sha) throw new Error("持っていく変更を stash に入れられませんでした");
  return { sha, tag };
}

/** 持っていく変更を dir に戻す（ステージしたかどうかも保つ）。新しいワークツリーへ入れるときも、失敗して元の場所へ戻すときも使う */
export async function applyCarry(dir: string, carried: CarriedChanges): Promise<void> {
  await gitOutput(dir, ["stash", "apply", "--index", carried.sha], [], 120_000);
}

/** 持っていき終えた stash の項目を消す（ほかの作業場所が stash を足していても、印で探し直して自分の項目だけを消す） */
export async function dropCarry(dir: string, carried: CarriedChanges): Promise<void> {
  const list = await gitOutput(dir, ["stash", "list", "--format=%gd %H %gs"]);
  for (const line of list.split("\n")) {
    const [ref, sha, ...rest] = line.split(" ");
    if (sha === carried.sha && rest.join(" ").endsWith(carried.tag)) {
      await gitOutput(dir, ["stash", "drop", ref]);
      return;
    }
  }
}

/** 持っていくファイルの一覧（移す前の確かめに出す。dir の中から見たパス） */
export async function carryFiles(dir: string): Promise<string[]> {
  const out = await gitOutput(dir, ["status", "--porcelain=v1", "-z", "--untracked-files=all", "--", "."]);
  const files: string[] = [];
  const parts = out.split("\0");
  for (let i = 0; i < parts.length; i++) {
    const entry = parts[i];
    if (entry.length < 4) continue;
    const code = entry.slice(0, 2);
    files.push(entry.slice(3));
    // 名前の変更は元の名前が続くので読み飛ばす
    if (code.includes("R") || code.includes("C")) i++;
  }
  return files;
}

async function findStash(dir: string, tag: string): Promise<string | null> {
  const list = await gitOutput(dir, ["stash", "list", "--format=%H %gs"]);
  for (const line of list.split("\n")) {
    const [sha, ...rest] = line.split(" ");
    if (sha && rest.join(" ").endsWith(tag)) return sha;
  }
  return null;
}

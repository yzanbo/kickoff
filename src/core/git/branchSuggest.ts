/**
 * やりたいことの概要から、新しいワークツリーのブランチ名の案を AI に出してもらう頼み方と、答えの読み方（routes/worktrees.ts の branch-suggestions）。
 * 答えはそのまま使わず、Git のブランチ名に使える形にそろえ、いまあるブランチと同じ名前・重なりは除く
 */

/** 案の数（多すぎると選びにくい） */
export const BRANCH_SUGGESTION_COUNT = 3;
/** ブランチ名の長さの上限（フォルダ名にもなるので短めに） */
const MAX_BRANCH_LENGTH = 60;
/** 頼みに見せる、いまあるブランチの数の上限 */
const MAX_TAKEN_IN_PROMPT = 50;
/** 頼みに入れる概要の長さの上限 */
const MAX_SUMMARY_LENGTH = 2000;

export function branchSuggestPrompt(summary: string, taken: readonly string[]): string {
  const known = taken.slice(0, MAX_TAKEN_IN_PROMPT);
  return [
    `次の「やりたいこと」の作業をする Git のブランチ名を ${BRANCH_SUGGESTION_COUNT} つ提案してください。`,
    "決まり: 種類の頭（feature/・fix/・refactor/・docs/・test/・chore/ のどれか）のあとに、英小文字・数字・ハイフンだけで短く書く（全体で 40 文字以内）。日本語はローマ字にせず、意味を英語にする。",
    known.length > 0 ? `いまあるブランチ（同じ名前は避ける）: ${known.join(", ")}` : "",
    "1 行に 1 つ、ブランチ名だけを出力してください。番号・説明・記号・引用符は付けないでください。",
    "",
    "<やりたいこと>",
    summary.trim().slice(0, MAX_SUMMARY_LENGTH),
    "</やりたいこと>",
  ]
    .filter((line, i) => line !== "" || i > 2)
    .join("\n");
}

/**
 * 文を Git のブランチ名に使える形にそろえる（英小文字・数字・「/ . _ -」だけ。空白はハイフン。「..」・「.」で始まる区切り・「.lock」で終わる・空の区切りを除く）。
 * 使えるものが残らなければ null
 */
export function toBranchName(raw: string): string | null {
  const name = raw
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9/._-]/g, "")
    .replace(/\.{2,}/g, ".")
    .replace(/-{2,}/g, "-")
    .split("/")
    .map((part) => part.replace(/^[.-]+|[.-]+$/g, "").replace(/\.lock$/, ""))
    .filter(Boolean)
    .join("/")
    .slice(0, MAX_BRANCH_LENGTH)
    .replace(/[/.-]+$/, "");
  // 種類の頭だけ（「feature」など）では、何の作業か分からない
  return name && name.includes("/") ? name : name.length >= 3 ? name : null;
}

/** AI の答えから、ブランチ名の案を取り出す（行ごと。番号・箇条書きの印・引用符は外す。いまあるブランチと同じもの・重なりは除き、案の数まで） */
export function parseBranchSuggestions(answer: string, taken: readonly string[]): string[] {
  const used = new Set(taken.map((b) => b.toLowerCase()));
  const out: string[] = [];
  for (const line of answer.split("\n")) {
    // 後ろに添えた説明（「（…）」「 (…)」「 - …」「: …」）は外す
    const cleaned = line
      .replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "")
      .replace(/[`"'「」]/g, "")
      .split(/\s*[（(]|\s+[-–—:：]\s+|[:：]\s/)[0];
    const name = toBranchName(cleaned);
    if (!name || used.has(name)) continue;
    used.add(name);
    out.push(name);
    if (out.length >= BRANCH_SUGGESTION_COUNT) break;
  }
  return out;
}

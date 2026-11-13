// ［AI で整える］のチャットの名前と最初の指示（ワークツリーの実行環境の段階 2）。手順で直せなかった所を、Git で管理していないファイルだけで AI に直してもらう
import { WORKTREE_BAND_SIZE, worktreeSlotLabel, type WorktreeEnv } from "@shared/types";
import { KICKOFF_BLOCK_END, KICKOFF_BLOCK_START } from "./envRewrite.js";
import { OVERRIDE_FILE } from "./files.js";

/** ［AI で整える］のチャットの名前（ブランチがなければフォルダ名） */
export const envSetupTitle = (label: string) => `実行環境を整える（${label}）`;

export interface EnvSetupPromptInput {
  /** ワークツリーの札（ブランチ名。なければフォルダ名） */
  label: string;
  /** 作業するフォルダ（ワークツリー） */
  path: string;
  /** 本体のフォルダ */
  mainPath: string;
  env: Omit<WorktreeEnv, "app_url">;
  /** ほかのワークツリーに渡してある帯（全プロジェクト。小さい順） */
  otherBands: number[];
}

const bullets = (items: string[]) => items.map((i) => `- ${i}`).join("\n");

/** ［AI で整える］のチャットに最初に送る指示 */
export function envSetupPrompt({ label, path, mainPath, env, otherBands }: EnvSetupPromptInput): string {
  const band = env.band;
  const parts: string[] = [
    `ワークツリー「${label}」（${path}）の実行環境を整えてください。本体（${mainPath}）と同時にアプリ・Docker を動かしても、ポートの番号・Docker の組の名前・データがぶつからないようにするのが目的です。`,
    "Kickoff がワークツリーを作ったときの手順で、次のように割り当てました。手順で直せなかった所を直してください。",
  ];
  const facts: string[] = [];
  if (band !== null) {
    facts.push(`このワークツリーのポートの帯: ${band}〜${band + WORKTREE_BAND_SIZE - 1}（${band} は開発サーバー。チャットとターミナルには環境変数 PORT=${band} を渡しています）`);
    const slots = env.slots.map(worktreeSlotLabel);
    facts.push(`使っている番号: ${slots.length ? slots.join(" ／ ") : "なし"}`);
  } else {
    facts.push("ポートの帯はまだ割り当てていません");
  }
  if (otherBands.length) facts.push(`ほかのワークツリーの帯（使わない）: ${otherBands.map((b) => `${b}〜${b + WORKTREE_BAND_SIZE - 1}`).join("、")}`);
  if (env.compose_names.length) facts.push(`Docker の組の名前: ${env.compose_names.map((n) => `${n.dir || "（直下）"} → ${n.name}`).join("、")}`);
  if (env.rewritten.length) facts.push(`書き換えた変数: ${env.rewritten.join("、")}`);
  parts.push(bullets(facts));
  if (env.blocked) parts.push(`手順が止まった理由:\n${bullets([env.blocked])}`);
  parts.push(env.issues.length ? `整えきれていない所:\n${bullets(env.issues)}` : "整えきれていない所は見つかっていません。念のため、ぶつかる所が残っていないか確かめてください。");
  parts.push(
    `守ること:\n${bullets([
      "書き換えてよいのは、Git で管理していないファイル（.env・.env.local など・.kickoff/ の中）だけです。Git で管理しているファイル（compose.yaml・vite.config・package.json など）は書き換えないでください（書こうとしても断られます）。直す必要があれば、直し方を報告に書いてください。",
      `新しく番号を使うときは、帯の中のまだ使っていない番号にしてください（ほかのワークツリーの帯と本体の番号は使わない）。`,
      `.env の「${KICKOFF_BLOCK_START}（…）」〜「${KICKOFF_BLOCK_END}」の中は Kickoff が書いたものなので、書き換えないでください。Docker のポートを変えるときは、${OVERRIDE_FILE}（compose のあるフォルダごと）を直してください。`,
      "コンテナを起動・停止しないでください（docker compose up / down は流さない）。git の中身を変えるコマンド（add・commit・checkout など）も使えません。",
    ])}`,
  );
  parts.push(
    `直したら、compose のあるフォルダで docker compose config を流し、name と ports が本体とぶつからないことを確かめてください（compose がなければ飛ばす）。最後に、直したもの・確かめた結果・直せなかったもの（理由と、利用者がすること）を短く報告してください。`,
  );
  return parts.join("\n\n");
}

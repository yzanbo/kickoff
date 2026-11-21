// 砂場で止まったときの文（プロバイダー非依存）: 失敗で終わった Bash の出力の「Operation not permitted」から断られた場所を読み、
// どこに書こうとして・なぜ断られたか・代わりの道を AI に書き添える（OS の文だけだと、AI が書き方を変えて試し直すため）
import { isInside, realPathLoose } from "@/foundation/core/system/paths";
import type { GuardVerdict } from "@/features/guard/core/rules";
import type { BashSandbox } from "./bashSandbox";

/** 1 回の結果で説明する場所の数の上限 */
const MAX_PATHS = 5;

/**
 * 出力から、書き込みを断られた場所（絶対パス）を読む。シェルのリダイレクト（zsh「operation not permitted: /a」・bash「/a: Operation not permitted」）・
 * コマンド（「touch: /a: Operation not permitted」）・Python（「Operation not permitted: '/a'」）・Node（「EPERM: operation not permitted, open '/a'」）の形
 */
export function deniedWritePaths(output: string): string[] {
  const found: string[] = [];
  const patterns = [
    /EPERM: operation not permitted, \w+ '(\/[^']+)'/gi,
    /operation not permitted: '?(\/[^'\s]+)'?/gi,
    /(\/[^\s:'"]+): Operation not permitted/gi,
  ];
  for (const pattern of patterns) for (const m of output.matchAll(pattern)) found.push(m[1]!);
  return [...new Set(found)].slice(0, MAX_PATHS);
}

/**
 * 断られた場所の説明（読み取れた場所がなければ null）。judge は書き込み先の守りの判定（ほかの作業場所かを見分ける。なければ外として扱う）。
 * 書ける場所の中なのに断られたものは、砂場がいつも書かせないファイル（作業場所の .claude/settings.json・git のフックと設定など）
 */
export async function sandboxDeniedNote(output: string, sandbox: BashSandbox, judge: ((target: string) => Promise<GuardVerdict>) | null): Promise<string | null> {
  const paths = deniedWritePaths(output);
  if (paths.length === 0) return null;
  const lines = await Promise.all(
    paths.map(async (p) => {
      const target = realPathLoose(p);
      if (sandbox.writableDirs.some((dir) => isInside(dir, target))) {
        return `- ${p}: 砂場がいつも書かせないファイル（作業場所の .claude/settings.json・git のフックと設定など）です。書き換えが要るなら、利用者に頼んでください。`;
      }
      const judged = judge ? await judge(target) : null;
      if (judged?.kind === "deny") return `- ${p}: ${judged.reason}`;
      return `- ${p}: 書ける場所の外です。このファイルを変えるなら Edit / Write を使ってください（Kickoff が利用者に確かめます）。利用者の設定を変えるコマンド（git config --global など）なら、利用者に示して自分のターミナルで流してもらってください。`;
    }),
  );
  return [
    `Kickoff の砂場が、このコマンドの書き込みを OS で断りました（AI の Bash が書けるのは、作業フォルダ・ノートフォルダ・一時フォルダ・キャッシュなどの決まった場所だけです）。書き方を変えて試し直しても通りません。`,
    ...lines,
  ].join("\n");
}

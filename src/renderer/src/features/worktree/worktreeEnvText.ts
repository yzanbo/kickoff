// ワークツリーの実行環境（ポートの帯・組の名前）の画面の文。札の説明・WorktreeBar・消す確認で同じ言葉にする
import { worktreeSlotLabel, type WorktreeEnv } from "@shared/types";

/** 消すときに一緒に消せる組の名前（Kickoff が割り当てたものだけ。本体と同じ組の名前のままなら空 = 選ばせない） */
export const removableComposeNames = (env: WorktreeEnv | null): string[] => env?.compose_names.map((n) => n.name) ?? [];

/** 消す確認のチェック（初めは選んだ状態。組の名前がなければ null） */
export function downVolumesCheck(env: WorktreeEnv | null): { label: string; initial: boolean; help: (checked: boolean) => string } | null {
  const names = removableComposeNames(env);
  if (names.length === 0) return null;
  return {
    label: "コンテナとデータも消す",
    initial: true,
    help: (checked) =>
      checked
        ? `docker compose down -v で、${names.join("・")} のコンテナとボリューム（DB のデータなど）を消します`
        : `${names.join("・")} のコンテナとボリュームは残ります（ポートの帯は空くので、あとで別のワークツリーが同じ番号を使うことがあります）`,
  };
}

/** ブラウザで開くときの表記（http:// を外す） */
export const appAddress = (env: WorktreeEnv) => env.app_url?.replace(/^https?:\/\//, "") ?? null;

/** 札の説明に添える行（アプリの URL と対応表。分けられないときはその理由） */
export function worktreeEnvLines(env: WorktreeEnv | null): string[] {
  if (!env) return [];
  if (env.blocked) return [`ポートは本体と同じです: ${env.blocked}`];
  const address = appAddress(env);
  return [
    ...(address ? [`アプリ ${address}`] : []),
    ...env.slots.filter((s) => s.kind === "docker").map(worktreeSlotLabel),
    ...(env.issues.length > 0 ? [`整えきれていない所が ${env.issues.length} 件あります`] : []),
  ];
}

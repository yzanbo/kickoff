// ワークツリーの実行環境（ポートの帯・組の名前）の画面の文。札の説明・WorktreeBar・消す確認で同じ言葉にする
import { worktreeSlotLabel, type WorktreeEnv } from "@shared/types";

/** 消すときに一緒に消せる組の名前（Kickoff が割り当てたものだけ。本体と同じ組の名前のままなら空 = 選ばせない） */
export const removableComposeNames = (env: WorktreeEnv | null): string[] => env?.compose_names.map((n) => n.name) ?? [];

/** 消す確認に添えるチェック（初めは選んだ状態） */
interface RemovalCheck {
  label: string;
  initial: boolean;
  help: (checked: boolean) => string;
}

/** 消す確認のチェック「コンテナとデータも消す」（組の名前がなければ null） */
export function downVolumesCheck(env: WorktreeEnv | null): RemovalCheck | null {
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

/** 消す確認のチェック「この接続も消す」（Docker タブの「DB で開く」でこのワークツリーの DB から作った接続。なければ null） */
export function dropConnectionsCheck(connections: { name: string }[]): RemovalCheck | null {
  if (connections.length === 0) return null;
  const names = connections.map((c) => `「${c.name}」`).join("・");
  return {
    label: connections.length > 1 ? `この接続も消す（${connections.length} 件）` : "この接続も消す",
    initial: true,
    help: (checked) =>
      checked ? `このワークツリーの DB を開いていた DB クライアントの接続 ${names} を消します` : `DB クライアントの接続 ${names} は残ります（ワークツリーを消すと、つなぐ先の DB はなくなります）`,
  };
}

/** 消す確認のチェックの並び（「コンテナとデータも消す」「この接続も消す」のうちあるもの）と、選んだ状態を API の項目に戻す口 */
export function removalChecks(env: WorktreeEnv | null, connections: { name: string }[]) {
  const volumes = downVolumesCheck(env);
  const drop = dropConnectionsCheck(connections);
  const checks = [volumes, drop].filter((c): c is RemovalCheck => c !== null);
  const read = (checked: boolean[]) => ({
    downVolumes: volumes ? (checked[checks.indexOf(volumes)] ?? false) : false,
    dropDbConnections: drop ? (checked[checks.indexOf(drop)] ?? false) : false,
  });
  return { checks, read };
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

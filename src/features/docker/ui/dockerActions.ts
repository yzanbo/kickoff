// Docker の操作の表（純粋）: compose の見出し・サービスの行・使い捨てのコンテナの行の操作を 1 つの表にし、
// ボタン列と右クリックのメニューの両方がここから描く（押せる条件と理由はこの表の 1 か所）
import type { DockerCompose, DockerContainer, DockerServiceInfo } from "@shared/docker/types";
import { DOCKER_DB_NO_PORT } from "@shared/docker/types";

export interface DockerActionSpec<Id extends string = string> {
  id: Id;
  /** メニューの文 */
  label: string;
  disabled: boolean;
  /** 押せない理由（ボタンとメニューの項目の title） */
  title?: string;
  danger?: boolean;
  /** メニューでこの項目の前に区切りを入れる */
  separator?: boolean;
}

export type ComposeActionId = "start_all" | "stop_all" | "restart_all" | "recreate" | "down" | "logs" | "file";
export type ServiceActionId = "unpause" | "start" | "stop" | "restart" | "logs" | "shell" | "db";
export type OneoffActionId = "stop" | "logs";

/** 表から 1 つ引く（ボタンが自分の操作の条件を読む） */
export function specOf<Id extends string>(specs: readonly DockerActionSpec<Id>[], id: Id): DockerActionSpec<Id> | undefined {
  return specs.find((s) => s.id === id);
}

/** compose の見出しの操作（操作の最中は全部押せない） */
export function composeActions(c: DockerCompose): DockerActionSpec<ComposeActionId>[] {
  const busy = c.operation !== null;
  const anyRunning = c.services.some((s) => s.running > 0 || s.oneoffs.some((x) => x.state === "running"));
  return [
    { id: "start_all", label: "すべて起動", disabled: busy || c.start_blocked !== null, title: c.start_blocked ?? undefined },
    { id: "stop_all", label: "すべて停止", disabled: busy || !anyRunning },
    { id: "restart_all", label: "すべて再起動", disabled: busy || !anyRunning },
    ...(c.config_changed ? [{ id: "recreate" as const, label: "作り直して起動…", disabled: busy }] : []),
    { id: "down", label: "片付け…", danger: true, disabled: busy || !c.created || c.down_blocked !== null, title: c.down_blocked ?? undefined },
    { id: "logs", label: "ログ", disabled: false, separator: true },
    { id: "file", label: "compose のファイルを開く", disabled: !c.file },
  ];
}

/** 行の主な操作（印で決める。動いていれば停止、一時停止なら再開、ほかは起動） */
export function primaryAction(s: DockerServiceInfo): { id: "unpause" | "stop" | "start"; label: string } {
  if (s.mark === "paused") return { id: "unpause", label: "再開" };
  if (s.running > 0) return { id: "stop", label: "停止" };
  return { id: "start", label: "起動" };
}

/** シェルで入るコンテナ（1 番目の動いているもの） */
export const shellTargetOf = (s: DockerServiceInfo): DockerContainer | undefined => s.containers.find((c) => c.state === "running");

/** 「DB で開く」を押せない理由（Mac にポートを出していない・起動を待っている。DB のサービスでなければ null） */
export function dbBlockedOf(s: DockerServiceInfo, waiting: boolean): string | null {
  if (s.db_kind === null) return null;
  if (s.published.length === 0) return DOCKER_DB_NO_PORT;
  return waiting ? `${s.name} の起動を待っています` : null;
}

/** サービスの行の操作（busy = この compose の操作の最中・dbWaiting = 「DB で開く」が起動を待っている） */
export function serviceActions(s: DockerServiceInfo, c: DockerCompose, { busy, dbWaiting }: { busy: boolean; dbWaiting: boolean }): DockerActionSpec<ServiceActionId>[] {
  // まだ作っていないサービスは、compose の起動を止める理由があれば起動できない
  const blocked = s.containers.length === 0 && c.start_blocked !== null ? c.start_blocked : null;
  const allRunning = s.running > 0 && s.running === s.containers.length;
  const dbBlocked = dbBlockedOf(s, dbWaiting);
  return [
    ...(s.mark === "paused" ? [{ id: "unpause" as const, label: "再開", disabled: busy }] : []),
    { id: "start", label: "起動", disabled: busy || blocked !== null || allRunning, title: blocked ?? undefined },
    { id: "stop", label: "停止", disabled: busy || s.running === 0 },
    { id: "restart", label: "再起動", disabled: busy || s.running === 0 },
    { id: "logs", label: "ログ", disabled: false, separator: true },
    { id: "shell", label: "シェル", disabled: !shellTargetOf(s) },
    ...(s.db_kind ? [{ id: "db" as const, label: "DB で開く", disabled: dbBlocked !== null || busy, title: dbBlocked ?? undefined }] : []),
  ];
}

/** 使い捨てのコンテナの行の操作 */
export function oneoffActions(c: DockerContainer, busy: boolean): DockerActionSpec<OneoffActionId>[] {
  return [
    { id: "stop", label: "停止", disabled: busy || c.state !== "running" },
    { id: "logs", label: "ログ", disabled: false },
  ];
}

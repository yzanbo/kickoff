// AI に見せる接続の引き方（DB のツール・open_sql・守りが同じものを使う）。接続は呼ぶたびに店から引き直す
// （作業の途中で利用者が許可を変えたら、次の呼び出しから効く）
import { isAiVisible } from "@shared/database/aiVisibility";
import { hasConnectCommands } from "@shared/database/dbPrep";
import type { DbConnection } from "@shared/database/types";
import { Invalid } from "@/foundation/core/errors";
import { hiddenDbTargets } from "./hiddenTargets";

export function createAiConnections(list: (projectId: number) => DbConnection[]) {
  const aiConnections = (projectId: number) => list(projectId).filter(isAiVisible);

  /**
   * AI に見せる接続を名前で引く（1 つしかなければ省いてよい。見せない接続は名前を出さずに断る）。
   * connecting: AI からつなぐか（つなぐときにコマンドを流す接続は、AI からはつながない。準備のコマンドは利用者が押したときだけ流す）
   */
  const findAiConnection = (projectId: number, name: string | undefined, { connecting }: { connecting: boolean }): DbConnection => {
    const shown = aiConnections(projectId);
    if (!name && shown.length !== 1) throw new Invalid(shown.length === 0 ? "このプロジェクトには、AI に見せる DB の接続がありません。" : "connection に接続の名前を渡してください（db_connections で一覧）。");
    const hit = name ? (shown.find((c) => c.name === name) ?? shown.find((c) => c.name.toLowerCase() === name.toLowerCase())) : shown[0];
    if (!hit) throw new Invalid(`「${name}」という AI に見せる接続はありません（db_connections で一覧。利用者が AI に見せないと決めた接続は使えません）。`);
    if (connecting && hasConnectCommands(hit.prep)) throw new Invalid(`「${hit.name}」はつなぐときにコマンドを流す接続なので、AI からは使えません。利用者に DB クライアントで見てもらってください。`);
    return hit;
  };

  return {
    /** AI に見せる接続（ai_access が none でないもの） */
    aiConnections,
    hasAiConnections: (projectId: number) => aiConnections(projectId).length > 0,
    findAiConnection,
    /** 見せない接続のつなぎ先（守りがシェルのコマンド・ファイルのツールを断る事実。SQLite のファイルは dirs の中で解く） */
    hiddenTargets: (projectId: number, dirs: string[]) => hiddenDbTargets(list(projectId), dirs),
  };
}

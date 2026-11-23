// つなぐ先（DbTarget）の組み立て: 接続の登録・秘密の値・作業場所から。ファイルの DB のパスの解き方と、Kickoff 自身の保存先を断る確かめもここ 1 つ
// （登録・取り込み・つなぐのすべてが insideKickoffData を通る）
import fs from "node:fs";
import path from "node:path";
import { isFileDb } from "@shared/database/connectionShape";
import { hasConnectCommands, normalizePrep, type DbPrepVars } from "@shared/database/dbPrep";
import { DB_NOT_IN_WORKTREE, DB_PREP_UNCONFIRMED, type DbConnection, type DbPrep } from "@shared/database/types";
import type { DbConnectionTestBody } from "@shared/database/api";
import type { DbTarget, DbTargetCommands } from "@shared/database/workerProtocol";
import type { Project } from "@shared/projects/types";
import { errorMessage } from "@shared/foundation/errors";
import { Conflict, Invalid, NotFound } from "@/foundation/core/errors";
import { appDataDir } from "@/foundation/core/system/appEnv";
import { expandHome, isInside, realPathLoose } from "@/foundation/core/system/paths";
import type { DbScope } from "./scope";
import type { DbSecretVault } from "./secrets";

/** コマンドの {host}・{port}・{database}・{user} に入れる値 */
export const prepVarsOf = (c: Pick<DbConnection, "host" | "port" | "database" | "username">): DbPrepVars => ({
  host: c.host,
  port: c.port === null ? null : String(c.port),
  database: c.database,
  user: c.username,
});

const commandsOf = (connectionId: number, c: Pick<DbConnection, "host" | "port" | "database" | "username">, prep: DbPrep): DbTargetCommands => ({
  connection_id: connectionId,
  tunnel: prep.tunnel,
  password: prep.password,
  my_ip_url: prep.my_ip_url,
  vars: prepVarsOf(c),
});

export interface DbTargetOptions {
  vault: DbSecretVault;
  /** Kickoff 自身の保存先（この中のファイルは登録させない。製品版・開発版の保存先もいつも断る） */
  dataDir: string;
  /** 製品版・開発版の保存先の親のフォルダ（OS の口の appDataRoot） */
  appDataRoot: string;
}

export type DbTargets = ReturnType<typeof createTargets>;

export function createTargets(opts: DbTargetOptions) {
  /**
   * Kickoff のデータフォルダの中のファイルか（リンクを解いた実体で比べる）。動いているアプリの保存先に加えて、製品版と開発版の両方の保存先も断る
   * （開発版から製品版の kickoff.db を登録して書き換える・AI に読ませることがないように）
   */
  const insideKickoffData = (file: string) => {
    const real = realPathLoose(file);
    return [opts.dataDir, appDataDir(opts.appDataRoot, "production"), appDataDir(opts.appDataRoot, "development")].some((dir) => isInside(realPathLoose(dir), real));
  };

  /**
   * ファイルの DB の絶対パス（相対ならプロジェクトフォルダから。ワークツリーではその中の同じパス）。
   * ワークツリーになければ 404（code: DB_NOT_IN_WORKTREE）、Kickoff の保存先の中なら 400
   */
  const dbFile = (filePath: string, project: Project, workdir: string | null): string => {
    const expanded = expandHome(filePath);
    const absolute = path.isAbsolute(expanded) ? expanded : path.resolve(workdir ?? project.repo_path, expanded);
    if (insideKickoffData(absolute)) throw new Invalid("Kickoff 自身のデータは登録できません");
    if (workdir && !path.isAbsolute(expanded) && !fs.existsSync(absolute)) throw new NotFound(`このワークツリーにはありません（${filePath}）`, DB_NOT_IN_WORKTREE);
    return absolute;
  };

  /** つなぐときに流すコマンド（ポートの転送・パスワードを取る）。確かめていなければ 409 と DB_PREP_UNCONFIRMED（画面が中身を見せて確かめさせる） */
  const connectCommands = (connection: DbConnection): DbTargetCommands | null => {
    if (isFileDb(connection.engine) || !hasConnectCommands(connection.prep)) return null;
    if (!connection.prep_confirmed) {
      throw new Conflict(`「${connection.name}」はつなぐときにコマンドを流します。流す前に、コマンドの中身を確かめてください`, DB_PREP_UNCONFIRMED);
    }
    return commandsOf(connection.id, connection, connection.prep!);
  };

  return {
    /** 登録・取り込みの前の確かめ（ファイルの DB は Kickoff の保存先の中を断る） */
    checkFile(filePath: string | null, project: Project) {
      if (filePath) dbFile(filePath, project, null);
    },

    /**
     * 接続からつなぐ先を組み立てる（database を指せば、その DB に。PostgreSQL は DB ごとにつなぎ直すため）。
     * ai なら AI 用のユーザー（あれば）でつなぎ、接続の設定によらず DB 側も読み取り専用にする。
     * パスワードはキーチェーンで開く（開けなければ DbPasswordLocked。ほかの確かめを先に済ませ、要らないときに許可を聞かない）
     */
    async target({ connection, project, workdir }: DbScope, o: { write?: boolean; database?: string | null; ai?: boolean } = {}): Promise<DbTarget> {
      const fileDb = isFileDb(connection.engine);
      const file = fileDb && connection.file_path ? dbFile(connection.file_path, project, workdir) : null;
      const commands = connectCommands(connection);
      const aiUser = o.ai && connection.ai_username ? connection.ai_username : null;
      const password = await opts.vault.read(connection, aiUser ? "ai_password" : "password");
      const ssh = !fileDb && connection.ssh ? { ...connection.ssh, password: await opts.vault.read(connection, "ssh_password") } : null;
      return {
        engine: connection.engine,
        host: connection.host,
        port: connection.port,
        database: o.database ?? connection.database,
        username: aiUser ?? connection.username,
        password,
        file,
        ssl: connection.ssl,
        read_only: o.ai ? true : connection.read_only && !o.write,
        ssh,
        commands,
      };
    },

    /**
     * 「つながるか試す」のつなぐ先（保存しない。password を省けば、own（同じプロジェクトの保存した接続）のパスワード）。
     * 接続のダイアログで見えているコマンドを利用者が押して流すので、確かめ済みかは問わない。パスワードを読めなければ投げ、組めなければ失敗の文を返す
     */
    async testTarget(project: Project, body: DbConnectionTestBody, workdir: string | null, own: DbConnection | undefined): Promise<DbTarget | { error: string }> {
      const password = body.password !== undefined ? body.password : own ? await opts.vault.read(own, "password") : null;
      const sshPassword = body.ssh_password !== undefined ? body.ssh_password : own ? await opts.vault.read(own, "ssh_password") : null;
      const ssh = body.ssh === undefined ? (own?.ssh ?? null) : body.ssh;
      const prep = normalizePrep(body.prep === undefined ? (own?.prep ?? null) : body.prep);
      const fileDb = isFileDb(body.engine);
      try {
        return {
          engine: body.engine,
          host: body.host,
          port: body.port,
          database: body.database,
          username: body.username,
          password,
          file: fileDb && body.file_path ? dbFile(body.file_path, project, workdir) : null,
          ssl: body.ssl,
          read_only: true,
          ssh: !fileDb && ssh ? { ...ssh, password: sshPassword } : null,
          commands: !fileDb && hasConnectCommands(prep) ? commandsOf(own?.id ?? 0, body, prep!) : null,
        };
      } catch (e) {
        return { error: errorMessage(e) };
      }
    },
  };
}

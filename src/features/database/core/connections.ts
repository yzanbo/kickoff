// 接続の登録: 項目の確かめ・作る・変える・写す・取り込む・消す・試す（ルートの判断と店の呼び出しはここ。パスワードは金庫で暗号化してから置く）
import { isFileDb } from "@shared/database/connectionShape";
import { DB_ENVIRONMENT_DEFAULTS, type DbConnection } from "@shared/database/types";
import type { DbConnectionPatch, DbConnectionTestBody, DbConnectionTestResult, DbEnteredPasswordsBody, DbImportBody, NewDbConnectionBody } from "@shared/database/api";
import { DbWorkerError } from "@shared/database/workerProtocol";
import type { Project } from "@shared/projects/types";
import { errorMessage } from "@shared/foundation/errors";
import type { DockerApi } from "@/features/docker/core/index";
import { Invalid, NotFound } from "@/foundation/core/errors";
import { dockerDbTarget, parseDockerDbKey } from "./import/dockerTarget";
import { scanProjectDbs, toImportCandidates } from "./import/index";
import type { DbServiceParts } from "./parts";
import type { DbSecretKind } from "./secretKeys";
import type { DbScope } from "./scope";

export function createConnections({ store, client, vault, targets }: DbServiceParts, docker: Pick<DockerApi, "dbCandidate"> | undefined) {
  /** 種類ごとに要る項目の確かめ（ファイルの DB はファイル、ほかはホスト） */
  const validate = (project: Project, body: Pick<NewDbConnectionBody, "engine" | "host" | "file_path" | "ssh" | "prep">) => {
    if (isFileDb(body.engine)) {
      if (!body.file_path) throw new Invalid("SQLite のファイルを指定してください");
      targets.checkFile(body.file_path, project);
    } else if (!body.host) throw new Invalid("ホストを指定してください");
    if (body.ssh && body.prep?.tunnel?.trim()) throw new Invalid("SSH トンネルとポートを転送するコマンドは、どちらか 1 つにしてください");
  };

  /** プロジェクトの中の接続の案（Kickoff の保存先の中のファイルは案にしない） */
  const scanImports = (project: Project) =>
    scanProjectDbs(project.repo_path, (absolute) => {
      try {
        targets.checkFile(absolute, project);
        return true;
      } catch {
        return false;
      }
    });

  return {
    list: (projectId: number) => store.dbConnections.list(projectId),

    /** プロジェクトの接続（ほかのプロジェクトのものなら 404） */
    of(project: Project, id: number): DbConnection {
      const connection = store.dbConnections.get(id);
      if (!connection || connection.project_id !== project.id) throw new NotFound("DB の接続が見つかりません");
      return connection;
    },

    async create(project: Project, body: NewDbConnectionBody) {
      validate(project, body);
      return store.dbConnections.create(project.id, await vault.seal(body));
    },

    /** 書いた項目だけ変える（パスワードを保存し直したら、キーチェーンで開けなかったときに入れた値は使わない） */
    async update({ connection, project }: Pick<DbScope, "connection" | "project">, patch: DbConnectionPatch) {
      validate(project, { ...connection, ...patch });
      const updated = store.dbConnections.update(connection.id, await vault.seal(patch));
      if (patch.password !== undefined || patch.ai_password !== undefined || patch.ssh_password !== undefined) vault.forget(connection.id);
      return updated;
    },

    /**
     * ほかのプロジェクトの接続を写す（パスワードは選んだときだけ、暗号化したまま）。手順ノートはプロジェクトごとのノートのフォルダにあるので、
     * ほかのプロジェクトへは写さない（同じプロジェクトの中なら同じノートを指す）。準備のコマンドは写すが、写した先で確かめ直す。
     * 同じプロジェクトの中で写したら、名前に「のコピー」を付けて見分ける
     */
    copy(project: Project, fromId: number, copyPassword: boolean) {
      const from = store.dbConnections.get(fromId);
      if (!from) throw new NotFound("写す接続が見つかりません");
      const { id: _id, project_id: _p, position: _pos, has_password: _h, has_ai_password: _ha, has_ssh_password: _hs, prep_confirmed: _pc, last_connected_at: _l, created_at: _c, updated_at: _u, ...fields } = from;
      const secret = (kind: DbSecretKind) => (copyPassword ? store.dbConnections.storedSecret(from.id, kind) : null);
      const same = from.project_id === project.id;
      return store.dbConnections.create(project.id, {
        ...fields,
        name: same ? `${from.name} のコピー` : from.name,
        note_path: same ? from.note_path : null,
        password: secret("password"),
        ai_password: secret("ai_password"),
        ssh_password: secret("ssh_password"),
      });
    },

    /** プロジェクトから取り込める接続の案（パスワードは返さない） */
    async importCandidates(project: Project) {
      return toImportCandidates(await scanImports(project), store.dbConnections.list(project.id), project.repo_path);
    },

    /** 選んだ案を作る（パスワードは見つけた所から読み直す。Kickoff 自身の DB は断る） */
    async importConnections(project: Project, items: DbImportBody["items"]) {
      const found = new Map((await scanImports(project)).map((f) => [f.key, f]));
      // Docker タブの「DB で開く」の案（docker:…）は、compose に聞き直して作る（ワークツリーの DB なら、そのワークツリーを覚える）
      const worktreeOf = new Map<string, string | null>();
      for (const item of items) {
        const target = parseDockerDbKey(item.key);
        if (!target) continue;
        if (!docker) throw new Invalid("Docker の案は取り込めません");
        const result = await dockerDbTarget(docker, project, target.composeKey, target.service);
        if ("blocked" in result) throw new Invalid(result.blocked);
        found.set(item.key, result.found);
        worktreeOf.set(item.key, result.worktree_path ?? null);
      }
      const created = items.map((item) => {
        const f = found.get(item.key);
        if (!f) throw new NotFound("取り込む接続が見つかりません。プロジェクトの中が変わったかもしれないので、開き直してください");
        const body: NewDbConnectionBody = {
          name: item.name,
          engine: f.engine,
          environment: item.environment,
          host: f.host,
          port: f.port,
          database: f.database,
          username: f.username,
          file_path: f.file_path,
          ssl: f.ssl,
          ...DB_ENVIRONMENT_DEFAULTS[item.environment],
          password: f.password,
        };
        return { body, worktreePath: worktreeOf.get(item.key) ?? null };
      });
      for (const { body } of created) validate(project, body);
      const sealed = await Promise.all(created.map(async ({ body, worktreePath }) => ({ body: await vault.seal(body), worktreePath })));
      return sealed.map(({ body, worktreePath }) => store.dbConnections.create(project.id, body, worktreePath));
    },

    /** キーチェーンで開けなかったときに利用者が入れたパスワード（Kickoff を終えるまでメモリにだけ持つ。保存した値は変えない） */
    enterPasswords: (connection: DbConnection, body: DbEnteredPasswordsBody) => vault.enter(connection.id, body),

    /** つながるか試す（保存しない。password を省けば、connection_id の接続の保存したパスワード） */
    async test(project: Project, body: DbConnectionTestBody, workdir: string | null): Promise<DbConnectionTestResult> {
      const saved = body.connection_id ? store.dbConnections.get(body.connection_id) : undefined;
      const target = await targets.testTarget(project, body, workdir, saved && saved.project_id === project.id ? saved : undefined);
      if ("error" in target) return { ok: false, server_version: null, error: target.error, duration_ms: null };
      const started = performance.now();
      const elapsed = () => Math.round(performance.now() - started);
      try {
        const { server_version } = await client.request("test", { target }, { engine: target.engine });
        if (saved) store.dbConnections.touchConnected(saved.id);
        return { ok: true, server_version, error: null, duration_ms: elapsed() };
      } catch (e) {
        const code = e instanceof DbWorkerError ? e.code : undefined;
        return { ok: false, server_version: null, error: errorMessage(e), ...(code ? { code } : {}), duration_ms: elapsed() };
      }
    },
  };
}

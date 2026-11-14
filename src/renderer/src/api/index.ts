// サーバー（コアの HTTP API）の窓口。資源ごとの関数（api/<資源>.ts。コアの http/routes/<資源>.ts と対応する）を
// 1 つにまとめて出す（呼ぶ側は api.xxx(...)。名前が重なると後のもので上書きされるので、重ならないことを index.test.ts で確かめる）。
// 通信の土台（失敗・クエリの組み立て）は http.ts、SSE の接続は useServerConnection.ts（App で 1 回）、受け取ったイベントを各画面へ配るのは events.ts
import { approvalsApi } from "./approvals";
import { chatsApi } from "./chats";
import { databasesApi } from "./databases";
import { devicesApi } from "./devices";
import { filesApi } from "./files";
import { gitApi } from "./git";
import { githubApi } from "./github";
import { dockerApi } from "./docker";
import { ciApi } from "./ci";
import { portsApi } from "./ports";
import { groupsApi } from "./groups";
import { memosApi } from "./memos";
import { projectsApi } from "./projects";
import { providersApi } from "./providers";
import { queueApi } from "./queue";
import { settingsApi } from "./settings";
import { snippetsApi } from "./snippets";
import { trashApi } from "./trash";
import { turnsApi } from "./turns";
import { uploadsApi } from "./uploads";
import { usageApi } from "./usage";
import { voiceApi } from "./voice";
import { worktreesApi } from "./worktrees";

export const api = {
  ...settingsApi,
  ...devicesApi,
  ...projectsApi,
  ...chatsApi,
  ...turnsApi,
  ...queueApi,
  ...groupsApi,
  ...uploadsApi,
  ...approvalsApi,
  ...providersApi,
  ...usageApi,
  ...gitApi,
  ...filesApi,
  ...worktreesApi,
  ...voiceApi,
  ...memosApi,
  ...snippetsApi,
  ...databasesApi,
  ...githubApi,
  ...dockerApi,
  ...ciApi,
  ...portsApi,
  ...trashApi,
};

export { ApiError } from "./http";
export { attachmentUrl } from "./uploads";
export type { GitTarget } from "./workdir";

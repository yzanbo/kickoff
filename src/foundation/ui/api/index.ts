// サーバー（コアの HTTP API）の窓口。資源ごとの関数（api/<資源>.ts。コアの http/routes/<資源>.ts と対応する）を
// 1 つにまとめて出す（呼ぶ側は api.xxx(...)。名前が重なると後のもので上書きされるので、重ならないことを index.test.ts で確かめる）。
// 取り決めから呼ぶ口は client.ts（乗せ替えた機能は ui/api.ts に client(<機能>Contract)）、通信の土台（失敗・クエリの組み立て）は http.ts、SSE の接続は useServerConnection.ts（App で 1 回）、受け取ったイベントを各画面へ配るのは events.ts
import { approvalsApi } from "@/features/chat/ui/api/approvals";
import { chatsApi } from "@/features/chat/ui/api/chats";
import { chatImagesApi } from "@/features/remoteImages/ui/api/chatImages";
import { databasesApi } from "@/features/database/ui/api/databases";
import { devicesApi } from "@/features/devices/ui/api/devices";
import { filesApi } from "@/features/files/ui/api/files";
import { gitApi } from "@/features/git/ui/api/git";
import { githubApi } from "@/features/github/ui/api/github";
import { dockerApi } from "@/features/docker/ui/api/docker";
import { ciApi } from "@/features/github/ui/api/ci";
import { portsApi } from "@/features/ports/ui/api/ports";
import { groupsApi } from "@/features/groups/ui/api/groups";
import { notesApi } from "@/features/notes/ui/api/notes";
import { projectsApi } from "@/features/projects/ui/api/projects";
import { providersApi } from "@/features/ai/ui/api/providers";
import { queueApi } from "@/features/queue/ui/api/queue";
import { settingsApi } from "@/features/settings/ui/api/settings";
import { snippetsApi } from "@/features/snippets/ui/api/snippets";
import { terminalsApi } from "@/features/terminal/ui/api/terminals";
import { trashApi } from "@/features/trash/ui/api/trash";
import { turnsApi } from "@/features/chat/ui/api/turns";
import { uploadsApi } from "@/features/attachments/ui/api/uploads";
import { usageApi } from "@/features/ai/ui/api/usage";
import { voiceApi } from "@/features/voice/ui/api/voice";
import { worktreesApi } from "@/features/worktrees/ui/api/worktrees";

export const api = {
  ...settingsApi,
  ...terminalsApi,
  ...devicesApi,
  ...projectsApi,
  ...chatsApi,
  ...chatImagesApi,
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
  ...notesApi,
  ...snippetsApi,
  ...databasesApi,
  ...githubApi,
  ...dockerApi,
  ...ciApi,
  ...portsApi,
  ...trashApi,
};

export { ApiError } from "./http";
export { client } from "./client";
export { attachmentUrl } from "@/features/attachments/ui/api/uploads";
export type { GitTarget } from "./workdir";

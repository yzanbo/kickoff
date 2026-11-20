// 全部の機能の取り決めの値の表を並べたもの（純粋。型の合併は作らない。各機能の表は src/shared/<機能>/）
import { aiEvents } from "@shared/ai/events";
import { chatEvents } from "@shared/chat/events";
import { databaseEvents } from "@shared/database/events";
import { deviceEvents } from "@shared/devices/events";
import { dockerEvents } from "@shared/docker/events";
import { githubEvents } from "@shared/github/events";
import { groupEvents } from "@shared/groups/events";
import { noteEvents } from "@shared/notes/events";
import { notificationEvents } from "@shared/notifications/events";
import { portEvents } from "@shared/ports/events";
import { projectEvents } from "@shared/projects/events";
import { remoteImageEvents } from "@shared/remoteImages/events";
import { settingsEvents } from "@shared/settings/events";
import { snippetEvents } from "@shared/snippets/events";
import { trashEvents } from "@shared/trash/events";
import { voiceEvents } from "@shared/voice/events";
import { worktreeEvents } from "@shared/worktrees/events";

/** SSE の種類の表（機能の並びの順。端末に届ける種類と、種類の網羅の記録が読む） */
export const ALL_EVENT_TABLES = [
  settingsEvents,
  trashEvents,
  projectEvents,
  groupEvents,
  aiEvents,
  chatEvents,
  snippetEvents,
  remoteImageEvents,
  notificationEvents,
  dockerEvents,
  worktreeEvents,
  githubEvents,
  noteEvents,
  databaseEvents,
  portEvents,
  voiceEvents,
  deviceEvents,
] as const;

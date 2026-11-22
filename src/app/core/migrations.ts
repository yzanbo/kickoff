import { BASE_SCHEMA_V1 } from "@/foundation/core/db/baseSchema";
import type { Migration } from "@/foundation/core/db/db";
import { AI_SCHEMA_V1 } from "@/features/ai/core/schema";
import { CHAT_SCHEMA_V1 } from "@/features/chat/core/schema";
import { DATABASE_SCHEMA_V1 } from "@/features/database/core/schema";
import { DEVICES_SCHEMA_V1 } from "@/features/devices/core/schema";
import { GITHUB_SCHEMA_V1 } from "@/features/github/core/schema";
import { GROUPS_SCHEMA_V1 } from "@/features/groups/core/schema";
import { PROJECTS_SCHEMA_V1 } from "@/features/projects/core/schema";
import { PROVIDER_SWITCH_SCHEMA_V1 } from "@/features/providerSwitch/core/schema";
import { REMOTE_IMAGES_SCHEMA_V1 } from "@/features/remoteImages/core/schema";
import { SNIPPETS_SCHEMA_V1 } from "@/features/snippets/core/schema";
import { TRASH_SCHEMA_V1 } from "@/features/trash/core/schema";
import { WORKTREES_SCHEMA_V1 } from "@/features/worktrees/core/schema";

/**
 * Kickoff のスキーマの版（user_version は 300 ＋ 版）。v1 は全部の機能の表を FK の向き（参照する表より後ろ）に並べる。
 * 変えるときはこの配列の末尾に版を足す（既存の要素は書き換えない。v1 を書き換えてよいのは、製品版に出す前の作り直しの間だけ）
 */
export const MIGRATIONS: readonly Migration[] = [
  {
    version: 1,
    sql: [
      BASE_SCHEMA_V1,
      PROJECTS_SCHEMA_V1,
      AI_SCHEMA_V1,
      GROUPS_SCHEMA_V1,
      CHAT_SCHEMA_V1,
      PROVIDER_SWITCH_SCHEMA_V1,
      REMOTE_IMAGES_SCHEMA_V1,
      SNIPPETS_SCHEMA_V1,
      WORKTREES_SCHEMA_V1,
      GITHUB_SCHEMA_V1,
      DEVICES_SCHEMA_V1,
      TRASH_SCHEMA_V1,
      DATABASE_SCHEMA_V1,
    ].join("\n"),
  },
];

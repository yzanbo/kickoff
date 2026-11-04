import assert from "node:assert/strict";
import { test } from "node:test";
import { api } from "./index";
import { approvalsApi } from "./approvals";
import { chatsApi } from "./chats";
import { filesApi } from "./files";
import { gitApi } from "./git";
import { groupsApi } from "./groups";
import { projectsApi } from "./projects";
import { providersApi } from "./providers";
import { queueApi } from "./queue";
import { settingsApi } from "./settings";
import { turnsApi } from "./turns";
import { uploadsApi } from "./uploads";
import { usageApi } from "./usage";
import { voiceApi } from "./voice";
import { worktreesApi } from "./worktrees";

const groups = { approvalsApi, chatsApi, filesApi, gitApi, groupsApi, projectsApi, providersApi, queueApi, settingsApi, turnsApi, uploadsApi, usageApi, voiceApi, worktreesApi };

test("api: 資源ごとの関数の名前は重ならず、すべて api に入っている（重なると後のもので上書きされる）", () => {
  const owner = new Map<string, string>();
  for (const [group, fns] of Object.entries(groups)) {
    for (const name of Object.keys(fns)) {
      assert.equal(owner.get(name), undefined, `${name} が ${owner.get(name)} と ${group} で重なっています`);
      owner.set(name, group);
    }
  }
  // 資源のファイルを足したら、ここにも足す（api に入っていて、ここにないものがあれば数が合わない）
  assert.deepEqual(Object.keys(api).sort(), [...owner.keys()].sort());
});

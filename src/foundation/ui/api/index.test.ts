import assert from "node:assert/strict";
import { test } from "vitest";
import { api } from "./index";
import { approvalsApi } from "@/features/chat/ui/api/approvals";
import { chatsApi } from "@/features/chat/ui/api/chats";
import { chatImagesApi } from "@/features/remoteImages/ui/api/chatImages";
import { ciApi } from "@/features/github/ui/api/ci";
import { filesShared } from "@/features/files/ui/api/files";
import { gitShared } from "@/features/git/ui/api/git";
import { githubApi } from "@/features/github/ui/api/github";
import { groupsApi } from "@/features/groups/ui/api/groups";
import { projectsApi } from "@/features/projects/ui/api/projects";
import { providersApi } from "@/features/ai/ui/api/providers";
import { settingsApi } from "@/features/settings/ui/api/settings";
import { turnsApi } from "@/features/chat/ui/api/turns";
import { uploadsApi } from "@/features/attachments/ui/api/uploads";
import { worktreesApi } from "@/features/worktrees/ui/api/worktrees";

const groups = { approvalsApi, chatsApi, chatImagesApi, filesShared, gitShared, groupsApi, projectsApi, providersApi, settingsApi, turnsApi, uploadsApi, worktreesApi, githubApi, ciApi };

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

// AI の get_user_view に返す GitHub の画面の説明（土台の viewDescribers に出す）: 開いている issue・PR
import type { ViewDescriber } from "@/foundation/ui/shell/viewDescribers";
import { readSetting } from "@/foundation/ui/storage";
import { parseGitHubSelected } from "./openGitHubItem";
import { storage } from "./storage";

export const githubDescriber: ViewDescriber = {
  view: "github",
  describe: ({ projectId }) => ({ kind: "github", item: parseGitHubSelected(readSetting(storage.settings.selected(projectId))), project_id: projectId }),
};

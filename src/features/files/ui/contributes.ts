// files が拡張点に出すもの（app/renderer/registry.ts が入れる）: ファイルのタブの種類 2 つ（と AI に返す説明）・ファイルの右の欄と、ファイルの行き先、プロジェクトの画面のファイル・検索、⌘⇧F、会話の中のファイルのリンク・作業場所のファイルの一覧を読む口
import { openTargets } from "@/foundation/ui/navigation/open";
import { panelSurfaces, panelTabs } from "@/features/panel/ui";
import { fileTarget } from "./openTargets";
import { fileTabKind, projectFileTabKind } from "./fileTabKinds";
import { fileSurface } from "./fileSurface";
import { projectViews } from "@/features/projects/ui";
import { filesView, searchView } from "./projectViews";
import { popoutKinds } from "@/foundation/ui/navigation/popout";
import { filePopout } from "./popoutKinds";
import { codeSearchCommand } from "./codeSearchFocus";
import { chatFileLinks } from "@/features/chat/ui";
import { filesChatFileLinks } from "./links/chatFileLinksPort";
import { describeTab, editorView, userViewTabs } from "@/features/userView/ui";
import { workplaceFilesSources } from "@/foundation/ui/workplace/workplaceFiles";
import { workdirInput } from "@/foundation/ui/api/workdir";
import { filesApi } from "./api";

export const contributes = [
  panelTabs.item(fileTabKind),
  panelTabs.item(projectFileTabKind),
  userViewTabs.item(describeTab("file", (t) => editorView(t.projectId, t.path, t.worktree ?? null, t.line))),
  userViewTabs.item(describeTab("projectFile", (t) => editorView(t.projectId, t.path, null, t.line))),
  panelSurfaces.item(fileSurface),
  openTargets.item(fileTarget),
  projectViews.item(filesView),
  projectViews.item(searchView),
  popoutKinds.item(filePopout),
  codeSearchCommand,
  chatFileLinks.item(filesChatFileLinks),
  workplaceFilesSources.item({ files: (target) => filesApi("GET /api/projects/:projectId/files", workdirInput(target)) }),
];

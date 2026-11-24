// テストの呼び手（testClient）に渡す、全部の機能の HTTP の取り決めを 1 つにした表（機能の並びの順）。テストからだけ使う
import { serverContract } from "@shared/foundation/serverContract";
import { trashContract, archiveCleanupContract, orphanSessionsContract } from "@shared/trash/contract";
import { projectContract } from "@shared/projects/contract";
import { groupContract } from "@shared/groups/contract";
import { aiDefaultsContract, usageContract } from "@shared/ai/contract";
import { chatContract, approvalContract, chatTurnContract, chatQueueContract } from "@shared/chat/contract";
import { snippetContract } from "@shared/snippets/contract";
import { compactContract } from "@shared/compact/contract";
import { childChatContract } from "@shared/childChats/contract";
import { remoteImagesContract } from "@shared/remoteImages/contract";
import { providerSwitchContract } from "@shared/providerSwitch/contract";
import { workplaceMoveContract } from "@shared/workplaceMove/contract";
import { queueContract } from "@shared/queue/contract";
import { userViewContract } from "@shared/userView/contract";
import { notificationsContract } from "@shared/notifications/contract";
import { filesContract } from "@shared/files/contract";
import { gitContract } from "@shared/git/contract";
import { dockerContract } from "@shared/docker/contract";
import { worktreesContract } from "@shared/worktrees/contract";
import { githubPrContract } from "@shared/github/contract";
import { notesContract } from "@shared/notes/contract";
import { databaseContract } from "@shared/database/contract";
import { terminalContract } from "@shared/terminal/contract";
import { portsContract } from "@shared/ports/contract";
import { voiceContract } from "@shared/voice/contract";
import { devicesContract } from "@shared/devices/contract";

export const ALL_CONTRACTS = {
  ...serverContract,
  ...trashContract,
  ...archiveCleanupContract,
  ...orphanSessionsContract,
  ...projectContract,
  ...groupContract,
  ...aiDefaultsContract,
  ...usageContract,
  ...chatContract,
  ...approvalContract,
  ...chatTurnContract,
  ...chatQueueContract,
  ...snippetContract,
  ...compactContract,
  ...childChatContract,
  ...remoteImagesContract,
  ...providerSwitchContract,
  ...workplaceMoveContract,
  ...queueContract,
  ...userViewContract,
  ...notificationsContract,
  ...filesContract,
  ...gitContract,
  ...dockerContract,
  ...worktreesContract,
  ...githubPrContract,
  ...notesContract,
  ...databaseContract,
  ...terminalContract,
  ...portsContract,
  ...voiceContract,
  ...devicesContract,
} as const;

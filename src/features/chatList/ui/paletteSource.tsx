import type { PaletteItem } from "@/features/palette/ui";
import { busyWithUnread } from "@shared/chat/state";
import { chatTitle, StatusSlot, useChats, useChatStates } from "@/features/chat/ui";
import { useProjects } from "@/features/projects/ui";
import { PaletteChatChips, PaletteProjectMark } from "./PaletteChatParts";


export function useChatItems(enabled: boolean): readonly PaletteItem[] {
  const { chats } = useChats();
  const { stateOf } = useChatStates();
  const { projectName } = useProjects();
  if (!enabled) return NONE;
  return chats.map((r) => {
    const title = chatTitle(r.title);
    return {
      key: `r-${r.id}`,
      label: title,
      text: title,
      hint: projectName(r.project_id),
      hintMark: <PaletteProjectMark projectId={r.project_id} />,
      chips: <PaletteChatChips chat={r} />,
      icon: <StatusSlot state={stateOf(r)} unread={busyWithUnread(r, stateOf(r))} />,
      route: { name: "chat", projectId: r.project_id, chatId: r.id },
    };
  });
}

const NONE: readonly PaletteItem[] = [];

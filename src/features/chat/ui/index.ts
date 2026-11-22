// チャットの画面の入口（ほかの機能はここだけを読む。まだ中のファイルを直接読む所は、読み手を直す単位でここへ寄せる）
import { storage } from "./storage";
export { ChatStateMark } from "./state/ChatStateMark";
export { activityOf, activityText, latestOf } from "./state/stall";
export { relativeOf } from "./timeline/relativePath";
export { memoLast, type ChatSource } from "./store/chatSelector";
export { chatLog, defineChatSelector, useChatDetail, useChatOf, useOpenChat, useStreaming } from "./store/useChatStore";
export { chatTail, chatWindow, latestAnswer } from "./store/selectors";
export { PastWorkplacesProvider, useBeforeWorkplaceMove, usePastWorkplaceAt } from "./screen/pastWorkplace";
export { setSendExtras } from "./send/sendExtras";
export { chatQueueApi } from "./api/queue";
export { chatRoleOf, type ChatHost, type ChatRole, type NewChatPlace, type NewChatSeed } from "./screen/chatHost";
export { NewChatItem, NewChatPlaceBadges, useNewChatPlace } from "./open/NewChatItem";
export { askInNewChatOf, ChatScreenContext, useChatScreen, useOptionalChatScreen, type ChatScreenValue } from "./screen/chatScreen";
export { isScreenShown, lastPressedElement, lastPressedScreen, screenOfChat, shownChatIds, useRegisterScreen, type ScreenPorts } from "./screen/chatScreens";
export { clearKeepAlive, KeepAliveContext, setKeepAlive, useKeepAlive } from "./screen/keepAlive";
export { Elapsed } from "./parts/Elapsed";
export {
  ActivityNavContext,
  SubagentNavContext,
  TimelineNavContext,
  useActivityNav,
  useOptionalActivityNav,
  useOptionalSubagentNav,
  useOptionalTimelineNav,
  usePortValue,
  useSubagentNav,
  useTimelineNav,
  type ActivityFilter,
  type ActivityFocus,
  type ActivityNav,
  type ChatShowing,
  type SubagentNav,
  type TimelineNav,
} from "./screen/ports";
export { openAll, openKey, setOpen, timelineView, useTimelineOpen } from "./timeline/timelineView";
export { TimelineBusyContext, useTimelineBusy } from "./timeline/timelineBusy";
export type { RenderScope, ToolCall } from "./timeline/toolCall";
export { useMainChat } from "./screen/mainChat";
export { openAskChild, openChat, type AskChildTarget, openCreatedChild, openInRootSide, resolveOpenPlace } from "./open/openChat";
export { addChats, knownChat } from "./store/knownChats";
export { appendBlock } from "./quote";
export { chatTargetName, chatTitle } from "./chatTitle";
export { ancestorsOf, descendantStates, rootChatOf } from "./state/descendants";
export { confirmArchiveChats, confirmDeleteChats, confirmMoveChatToProject, markChatsSeen, moveChatsToGroup, togglePinChat } from "./chatActions";
export { aiToolViews, toolText } from "./tools/toolText";
export { SNAP_PX, scrollsUpKey, snapTarget } from "./parts/followScroll";
export { useFollowScroll } from "./parts/useFollowScroll";
export { LinkedItemChip } from "./parts/LinkedItemChip";
export { AgentListChip, type AgentListRow } from "./parts/AgentListChip";
export { CreatedChatMarks } from "./parts/ChatLinkChip";
export { useActionButton } from "./parts/useActionButton";
export { Working } from "./parts/Working";
export { DefaultOpenPlace, OpenPlaceButtons, placesOf, usePlaceCaps, type OpenPlace } from "./parts/OpenPlaceControls";
export { ChipWord, ComposerChip } from "./parts/ChatPill";
export { StatusSlot } from "./state/StatusSlot";
export { summaryState } from "./state/chatState";
export { useChatStates } from "./state/chatStates";
export { currentChats, useChats, useChildChats, useKnownChat } from "./store/knownChats";
export { chooseBusyWorkplaceAction } from "./workplace/busyWorkplace";
export { LineageTrail } from "./parts/LineageTrail";

/** ほかの機能も読む保存の設定（宣言は ./storage.ts） */
export const chatSettings = { childOpenOnCreate: storage.settings.childOpenOnCreate };

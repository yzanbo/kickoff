// チャットの画面の入口（ほかの機能はここだけを読む。まだ中のファイルを直接読む所は、読み手を直す単位でここへ寄せる）
import { storage } from "./storage";
export { ChatStateMark } from "./state/ChatStateMark";
export { activityOf, activityText, latestOf } from "./state/stall";
export { relativeOf } from "./timeline/relativePath";
export { memoLast, type ChatSource } from "./store/chatSelector";
export { chatLog, defineChatSelector, prefetchChats, useChatDetail, useChatOf, useOpenChat, useStreaming } from "./store/useChatStore";
export { chatTail, chatWindow, latestAnswer } from "./store/selectors";
export { PastWorkplacesProvider, useBeforeWorkplaceMove, usePastWorkplaceAt } from "./screen/pastWorkplace";
export { setSendExtras } from "./send/sendExtras";
export { chatQueueApi } from "./api/queue";
export { chatsApi } from "./api/chats";
export { turnsApi } from "./api/turns";
export { approvalsApi } from "./api/approvals";
export { chatRoleOf, type ChatHost, type NewChatPlace, type NewChatSeed, type SidePanelHandle, type SidePanelPort } from "./screen/chatHost";
export { NewChatItem, NewChatPlaceBadges, useNewChatPlace } from "./open/NewChatItem";
export { askInNewChatOf, ChatScreenContext, useChatScreen, useOptionalChatScreen, type ChatScreenValue } from "./screen/chatScreen";
export { isScreenShown, lastPressedElement, lastPressedScreen, screenAt, screenOfChat, shownChatIds, useRegisterScreen, type ScreenPorts } from "./screen/chatScreens";
export { clearKeepAlive, KeepAliveContext, setKeepAlive, useKeepAlive, useKeepAliveHold } from "./screen/keepAlive";
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
export { addTargetsOf } from "./screen/addTargets";
export { chatFileLinks, chatFileLinksPort, ChatFileLinksContext, openByClick, useChatFileLinks, useChatFileSource, type ChatFileLinks, type ChatFileLinksPort, type ChatFilePlace, type ChatFileSource } from "./screen/fileLinks";
export { chatSidePanel, chatsPanel, openChatTab, useShownInChatSide } from "./places";
export { createdChildPlace, openAskChild, openChat, type AskChildTarget, openCreatedChild, openInRootSide, resolveOpenPlace } from "./open/openChat";
export { addChat, addChats, knownChat } from "./store/knownChats";
export { appendBlock, quoteCode, quoteComment } from "./quote";
export { chatTargetName, chatTitle, NEW_CHAT_TITLE } from "./chatTitle";
export { closeChatWithChoice } from "./closeChat";
export { chatPaneSlot } from "./screen/ports";
export { ancestorsOf, descendantStates, rootChatOf } from "./state/descendants";
export { confirmArchiveChats, confirmDeleteChats, confirmMoveChatToProject, markChatsSeen, moveChatsToGroup, moveDroppedChatToProject, togglePinChat } from "./chatActions";
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
export { approvalIndex, stateCounts, waitingChats, type ApprovalIndex } from "./state/chatState";
export { currentChats, NO_CHATS, useChats, useChatsWithChildren, useChatsWithChildrenByProject, useChildChats, useKnownChat, useNoteChatOf } from "./store/knownChats";
export type { ChipsPortal } from "./screen/chipsPortal";
export { useChatsLinkedTo } from "./store/linkedChats";
export { chooseBusyWorkplaceAction } from "./workplace/busyWorkplace";
export { LineageTrail } from "./parts/LineageTrail";
export { ChatReadToggleItem, ReadToggleItem } from "./parts/ReadToggleItem";
export { readHolds } from "./state/readHolds";
export { READ_TOGGLE_KEY, reportReadFailure, setChatRead } from "./state/readToggle";

/** ほかの機能も読む保存の設定（宣言は ./storage.ts） */
export const chatSettings = { childOpenOnCreate: storage.settings.childOpenOnCreate, subagentOpenIn: storage.settings.subagentOpenIn, childOpenIn: storage.settings.childOpenIn };
export { busyBlockReason } from "./state/chatBusy";
export { useChatRename } from "./useChatRename";
export { workingFor } from "./currentWork";
export { useChatActivity } from "./currentWorkStore";
export { ChatTitleInput } from "./ChatTitleInput";
export { useChatSearch } from "./chatSearch";
export { useChipsPortal } from "./screen/chipsPortal";
export { MainChatContext } from "./screen/mainChat";
export { PastWorkplace } from "./screen/pastWorkplace";
export { COUNTED_COLUMNS, EMPTY_STATE_COUNTS, chatStateOf, type CountedColumn, type StateCounts } from "./state/chatState";
export { stalledAgents, type Activity } from "./state/stall";
export { byActive, useChatsByProject, useChatsLoaded, useChatsValue } from "./store/knownChats";
export type { ChatTitleEditor } from "./useChatRename";
export { BusyNeighborsNotice } from "./workplace/BusyNeighborsNotice";
export { useBusyNeighbors } from "./workplace/useBusyNeighbors";

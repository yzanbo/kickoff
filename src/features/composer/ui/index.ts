// 入力欄の入口（ほかの機能はここだけを読む。まだ中のファイルを直接読む所は、読み手を直す単位でここへ寄せる）
import { storage } from "./storage";
export { voiceReplies, type VoiceReply } from "./selectors";
export { SendCancelled } from "./useComposerSend";
export { useChatSend } from "./send/chatSend";
export { appendToDraft, startComposerDrafts } from "./appendToDraft";
export { appendDraft, chatComposerDraft, memoryDraft, settingDraft, type ComposerDraft } from "./composerDraft";
export { focusComposer, focusDraft, useComposerInsert } from "./composerFields";
export { claimVoiceHandoff, composerPills, composerSlots, loadComposerSlots, type ComposerBandProps, type ComposerPillProps, type ComposerPlace, type ComposerVoiceHooks, type ComposerVoiceModeInput, type FieldBridge, type FieldVoice, type FieldVoiceMode } from "./composerSlots";
export { MessageField, useMessageField, type MessageFieldState } from "./MessageField";
export { PLAIN_SUBMIT } from "./messageFieldModel";
export { useDraftFiles } from "./useDraftFiles";
export { useEditHold } from "./useEditHold";
export { AttachButton } from "./AttachButton";
export { PendingFileChips } from "./PendingFileChips";
export { Composer } from "./Composer";
export type { ComposerSend, OutgoingMessage } from "./composerModel";
export { createNewChatDraft, discardNewChatDraft, draftTitleOf, newChatComposerDraft, newChatDraft, patchNewChatDraft, readNewChatDrafts, subscribeNewChatDrafts, useNewChatDraft, useNewChatDrafts, type NewChatDraft, type NewChatDraftTarget } from "./newChatDrafts";

/** ほかの機能も読む保存の設定（宣言は ./storage.ts） */
export const composerSettings = { compact: storage.settings.compact } as const;
export { useQueueMode } from "./QueueModeToggle";
export type { SendWhen } from "./composerKeys";

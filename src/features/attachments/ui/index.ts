// 添付の入口（ほかの機能はここだけを読む。まだ中のファイルを直接読む所は、読み手を直す単位でここへ寄せる）
export { mergeAttachments } from "./attachmentMerge";
export { AttachmentChip, AttachmentChips } from "./AttachmentChip";
export { AttachmentPeek } from "./AttachmentPeek";
export { useAttachmentViewer } from "./useAttachmentViewer";
export { currentRange, pickedInCode, type PickedCode } from "./codePick";
export { cleanSelection, isLongSelection, lineCount, selectionButtonPoint, terminalCaptureLabel, terminalQuote } from "./longSelection";
export { captureOf, handOffTargets, linkChat, type HandOffItem, type HandOffTarget } from "./handoff/handOffTargets";
export { HandOffButton, HandOffItems } from "./handoff/HandOffMenu";
export { uploadsApi } from "./api/uploads";

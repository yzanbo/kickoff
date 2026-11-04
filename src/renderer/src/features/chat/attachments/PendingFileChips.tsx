import { AttachmentChip } from "./AttachmentChip";
import type { PendingFile } from "./useComposerFiles";

/** 選んだばかりの添付（アップロード中・済み・失敗）。× で外す。チャット欄と送信待ちの書き直しで共通 */
export function PendingFileChips({ files, onRemove }: { files: PendingFile[]; onRemove: (key: string) => void }) {
  return files.map((f) => (
    <span key={f.key} className="composer-attachment">
      <AttachmentChip
        // 保存できたら保存した大きさ（チャットの記録は中身をあとから作るので、選んだ時点では 0）。
        // ID は、アップロード済みの添付を入れたとき（送信待ちから新しいチャットへ）に、画像のサムネイルを保存先から出すため
        attachment={{ id: f.attachment?.id, name: f.file.name, mime: f.file.type, size: f.attachment?.size ?? f.file.size }}
        previewUrl={f.previewUrl}
        uploading={!f.attachment && !f.error}
        onRemove={() => onRemove(f.key)}
      />
      {f.error && <span className="error small">{f.error}</span>}
    </span>
  ));
}

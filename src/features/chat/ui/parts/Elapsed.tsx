import { TICK_SECOND, useTicker } from "@/foundation/ui/hooks/useTicker";
import { formatDuration } from "@/foundation/ui/lib/time";

/** since からの経過時間（1 秒ごとに進める。描き直しをこの中だけに閉じる）。作業中の行・実行中のツールに使う */
export function Elapsed({ since, className }: { since: string; className?: string }) {
  useTicker(TICK_SECOND);
  return <span className={className}>{formatDuration(Date.now() - new Date(since).getTime())}</span>;
}

import { useTicker } from "@/hooks/useTicker";
import { formatElapsed } from "@/lib/time";

/** since からの経過時間（1 秒ごとに進める。描き直しをこの中だけに閉じる）。作業中の行・実行中のツールに使う */
export function Elapsed({ since, className }: { since: string; className?: string }) {
  useTicker(1000);
  return <span className={className}>{formatElapsed(Date.now() - new Date(since).getTime())}</span>;
}

import { ChevronDown, ChevronRight } from "lucide-react";

/** 開閉の矢印（開いているときは下向き） */
export function Chevron({ open, size = 12 }: { open: boolean; size?: number }) {
  return open ? <ChevronDown size={size} /> : <ChevronRight size={size} />;
}

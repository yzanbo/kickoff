import { ArrowLeft, ArrowRight } from "lucide-react";
import { IconButton } from "@/ui/IconButton";
import type { useNavigationHistory } from "./useNavigationHistory";

/** パネルの中には置かず、サイドバーを閉じても最大表示しても同じ位置に残す */
export function NavigationButtons({ navigation }: { navigation: ReturnType<typeof useNavigationHistory> }) {
  return (
    <div className="navigation-buttons" role="group" aria-label="画面の移動">
      <IconButton icon={ArrowLeft} size={16} label="前の画面に戻る" keys="⌘[" disabled={!navigation.canGoBack} onClick={navigation.goBack} />
      <IconButton icon={ArrowRight} size={16} label="次の画面に進む" keys="⌘]" disabled={!navigation.canGoForward} onClick={navigation.goForward} />
    </div>
  );
}

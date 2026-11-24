import "./NavigationButtons.css";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { IconButton } from "@/foundation/ui/kit/IconButton";
import { useCommandKeys } from "@/foundation/ui/commands";
import type { useNavigationHistory } from "@/foundation/ui/navigation/useNavigationHistory";

/** パネルの中には置かず、サイドバーを閉じても最大表示しても同じ位置に残す */
export function NavigationButtons({ navigation }: { navigation: ReturnType<typeof useNavigationHistory> }) {
  const backKeys = useCommandKeys("navigation.back") ?? undefined;
  const forwardKeys = useCommandKeys("navigation.forward") ?? undefined;
  return (
    <div className="navigation-buttons" role="group" aria-label="画面の移動">
      <IconButton icon={ArrowLeft} iconSize={16} label="前の画面に戻る" keys={backKeys} disabled={!navigation.canGoBack} onClick={navigation.goBack} />
      <IconButton icon={ArrowRight} iconSize={16} label="次の画面に進む" keys={forwardKeys} disabled={!navigation.canGoForward} onClick={navigation.goForward} />
    </div>
  );
}

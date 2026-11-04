import { File, Folder, FolderOpen } from "lucide-react";
import { useEffect, useState } from "react";
import { useAppliedTheme } from "@/hooks/useAppliedTheme";

type IconUrl = (name: string, dir: boolean, open: boolean, theme: "dark" | "light") => string | undefined;

// アイコンの対応表は大きいので、初めて使うときに 1 回だけ読み込む
let resolver: IconUrl | undefined;
let loading: Promise<IconUrl> | undefined;

/** フォルダ・ファイルのアイコン（VS Code の Material Icon Theme。読み込むまでは線のアイコン） */
export function FileIcon({ name, dir = false, open = false }: { name: string; dir?: boolean; open?: boolean }) {
  const theme = useAppliedTheme();
  const [iconUrl, setIconUrl] = useState(() => resolver);
  useEffect(() => {
    if (iconUrl) return;
    let alive = true;
    void (loading ??= import("./fileIcons").then((m) => (resolver = m.iconUrl))).then((r) => alive && setIconUrl(() => r));
    return () => {
      alive = false;
    };
  }, [iconUrl]);
  const url = iconUrl?.(name, dir, open, theme);
  if (!url) return dir ? open ? <FolderOpen size={14} aria-hidden /> : <Folder size={14} aria-hidden /> : <File size={14} aria-hidden />;
  return <img className="file-icon" src={url} alt="" aria-hidden width={16} height={16} draggable={false} />;
}

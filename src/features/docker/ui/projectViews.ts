// docker がプロジェクトの画面の表（projectViews）に出す画面: Docker（本体とワークツリーの compose のサービス。この Mac のアプリの中だけ）
import { Container } from "lucide-react";
import type { ProjectViewDef } from "@/features/projects/ui";
import { DockerViewPage } from "./projectViewPages";

export const dockerView: ProjectViewDef = {
  id: "docker",
  label: "Docker",
  icon: Container,
  group: "docker",
  order: 90,
  desktopOnly: true,
  places: ["center", "rightSidebar", "chatSide"],
  Page: DockerViewPage,
};

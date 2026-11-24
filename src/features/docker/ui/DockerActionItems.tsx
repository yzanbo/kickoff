// Docker の操作の表（dockerActions.ts）を右クリックのメニューの項目に描く（ボタン列は各行が同じ表の条件を読む）
import { Fragment } from "react";
import { MenuSeparator } from "@/foundation/ui/kit/menuParts";
import { MenuItem } from "@/foundation/ui/kit/PopupMenu";
import type { DockerActionSpec } from "./dockerActions";

export function DockerActionItems<Id extends string>({ specs, run }: { specs: readonly DockerActionSpec<Id>[]; run: (id: Id) => void }) {
  return specs.map((spec) => (
    <Fragment key={spec.id}>
      {spec.separator && <MenuSeparator />}
      <MenuItem danger={spec.danger} disabled={spec.disabled} title={spec.title} onSelect={() => run(spec.id)}>
        {spec.label}
      </MenuItem>
    </Fragment>
  ));
}

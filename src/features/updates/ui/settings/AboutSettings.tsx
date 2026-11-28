import { useQuery } from "@/foundation/ui/query";
import { Field } from "@/foundation/ui/kit/Field";
import { buildLabel } from "@shared/updates/buildLabel";
import { updatesNative } from "@/features/updates/ui/native";

/** Kickoff について: 版・ビルド番号・短い SHA・作り方（手元ビルドか）。ブラウザで開いた画面には版を出さない（Mac のアプリの版を知らないため） */
export function AboutSettings() {
  const build = useQuery("AboutSettings.build", updatesNative.build);
  return (
    <section className="section">
      <h2>Kickoff について</h2>
      <div className="form">
        {build.data ? (
          <Field as="div" label="版" help="ビルド番号はコミットの数です。手元ビルドは npm run install-app で作った版で、配った版と同じ番号でも中身が新しいことがあります。">
            <span>{buildLabel(build.data)}</span>
          </Field>
        ) : (
          <p className="muted small">版はデスクトップアプリでだけ出します</p>
        )}
      </div>
    </section>
  );
}

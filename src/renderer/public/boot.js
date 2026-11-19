// 起動直後に、保存したテーマとサイドバーの形を <html> に出す（入口の JS と CSS を読む前に、いつもの地の色と骨組みで描くため。
// メモの仕様書「0023_表示を軽くする」の案 18a・U11。骨組みの CSS は index.html の <style>）。CSP がインラインのスクリプトを止めるので外のファイルにする。
// 値の読み方は lib/storageKeys.ts の kickoff:theme・kickoff:sidebar・kickoff:sidebar-width・kickoff:footer-mode と app/theme.ts・features/sidebar/useSidebar.ts と同じ
// （変えたら両方直す。src/renderer/src/app/bootScript.test.ts で確かめる）。ブラウザで開いた画面でも動く（window.kickoff を使わない）
(function () {
  var root = document.documentElement;
  try {
    var theme = localStorage.getItem("kickoff:theme");
    var dark = theme === "light" ? false : theme === "system" ? matchMedia("(prefers-color-scheme: dark)").matches : true;
    root.setAttribute("data-theme", dark ? "dark" : "light");
    // 別ウィンドウは地の色だけ（中身の形が種類ごとに違う）。サイドバーを閉じていても地の色だけ（上の帯は本物でも地と同じ色なので描かない）
    var popout = location.hash.indexOf("#/popout/") === 0;
    var sidebarOpen = localStorage.getItem("kickoff:sidebar") !== "0";
    root.setAttribute("data-boot-shell", popout ? "plain" : sidebarOpen ? "sidebar" : "main");
    // 保存した幅を、画面と同じ 200〜480 に丸める（範囲の外の値で、骨組みと本物の幅がずれないように。未保存・壊れた値は既定の 294）
    var width = Math.round(Math.min(480, Math.max(200, Number(localStorage.getItem("kickoff:sidebar-width")) || 294)));
    root.style.setProperty("--boot-sidebar-w", width + "px");
    // 下の帯の出し方（features/footer/footerMode.ts の kickoff:footer-mode。知らない値は既定の show）。show のときだけ骨組みに下の帯を描く
    var footer = localStorage.getItem("kickoff:footer-mode");
    root.setAttribute("data-boot-footer", footer === "hover" || footer === "hide" ? footer : "show");
  } catch (e) {
    // localStorage が読めなければ、既定（ダーク・サイドバーあり・294px）の骨組みのまま
  }
})();

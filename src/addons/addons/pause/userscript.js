import { isPaused, setPaused, onPauseChanged, setup } from "../debugger/module.js";

export default async function ({ addon, console, msg }) {
  setup(addon);

  // 外层容器承担按钮角色（负责圆点底色），内部 img 只承载图标。
  // 结构与 green-flag / stop-all 保持一致，sky-editor 主题下才能共用同一套交通灯样式。
  const btn = document.createElement("div");
  btn.className = "pause-btn";
  btn.title = msg("pause");

  const img = document.createElement("img");
  img.className = "pause-btn-icon";
  img.draggable = false;
  img.alt = "";
  btn.appendChild(img);

  const setSrc = () => {
    img.src = addon.self.getResource((isPaused() ? "/play.svg" : "/pause.svg")) /* rewritten by pull.js */;
    btn.title = isPaused() ? msg("play") : msg("pause");
  };
  btn.addEventListener("click", () => setPaused(!isPaused()));
  addon.tab.displayNoneWhileDisabled(btn);
  addon.self.addEventListener("disabled", () => setPaused(false));
  setSrc();
  onPauseChanged(setSrc);

  document.addEventListener(
    "keydown",
    function (e) {
      // e.code is not enough because that corresponds to physical keys, ignoring keyboard layouts.
      // e.key is not enough because on macOS, option+x types ≈ and shift+option+x types ˛
      // e.keyCode is always 88 when pressing x regardless of modifier keys, so that's how we'll handle macOS.
      // Because keyCode is deprecated we'll still check e.key in case keyCode is not as reliable as we think it is
      if (e.altKey && (e.key.toLowerCase() === "x" || e.keyCode === 88) && !addon.self.disabled) {
        e.preventDefault();
        e.stopImmediatePropagation();
        setPaused(!isPaused());
      }
    },
    { capture: true }
  );

  while (true) {
    await addon.tab.waitForElement("[class^='green-flag']", {
      markAsSeen: true,
      reduxEvents: ["scratch-gui/mode/SET_PLAYER", "fontsLoaded/SET_FONTS_LOADED", "scratch-gui/locales/SELECT_LOCALE"],
    });
    addon.tab.appendToSharedSpace({ space: "afterGreenFlag", element: btn, order: 0 });
  }
}

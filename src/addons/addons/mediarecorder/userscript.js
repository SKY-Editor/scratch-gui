import downloadBlob from "../../libraries/common/cs/download-blob.js";

// 顶栏录制按钮图标：内联 SVG + currentColor，跟随按钮前景色（浅色深色自动适配）。
// 空闲态 = 圆点录制，录制中（.is-recording）= 方块停止。
const RECORD_ICON_SVG =
  '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
  '<g class="sa-record-icon-idle">' +
    '<circle cx="12" cy="12" r="7.2" fill="none" stroke="currentColor" stroke-width="1.8"></circle>' +
    '<circle cx="12" cy="12" r="3.4" fill="currentColor"></circle>' +
  "</g>" +
  '<g class="sa-record-icon-active">' +
    '<circle cx="12" cy="12" r="7.2" fill="none" stroke="currentColor" stroke-width="1.8"></circle>' +
    '<rect x="8.6" y="8.6" width="6.8" height="6.8" rx="1.6" fill="currentColor"></rect>' +
  "</g>" +
  "</svg>";

// 标题栏图标：单色 SVG（明暗自适应由窗口引擎 + iconContrast 处理）
const RECORDER_ICON = "data:image/svg+xml," + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#000000" stroke-width="2" ' +
    'stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="6" width="13" height="12" rx="2.5"></rect>' +
    '<path d="M15 11.2l5.2-2.9v7.4L15 12.8z"></path></svg>'
);


export default async ({ addon, console, msg }) => {
  let recordElem;
  let recordLabel;
  let isRecording = false;
  let isWaitingForFlag = false;
  let waitingForFlagFunc = null;
  let abortController = null;
  let stopSignFunc = null;
  let recordBuffer = [];
  let recorder;
  let timeout;

  const mimeType = [
    // Chrome and Firefox only support encoding as webm
    // VP9 is preferred as its playback is better supported across platforms
    "video/webm; codecs=vp9",
    // Firefox only supports encoding VP8
    "video/webm",
    // Safari only supports encoding H264 as mp4
    "video/mp4",
  ].find((i) => MediaRecorder.isTypeSupported(i));
  const fileExtension = mimeType.split(";")[0].split("/")[1];

  // ===== 统一窗口宿主（与设置窗口 / Packager / 调试器同一套实现）=====
  // 两种主题都不再自建窗口壳，也不使用 DOM 窗口引擎：把内容 DOM 交给
  // window.__skyAddonWindow（components/gui/sky-addon-window-bridge.js），
  // 由 React 侧 sky-addon-window-host.jsx 用 ThemedWindow 渲染，外壳按主题分发——
  // SKY 主题是 Win11 窗口（标题栏三按钮、拖拽、缩放），TurboWarp 主题是官方 Modal
  // 弹窗（标题取窗口标题、内容区保持插件原有布局与尺寸）。
  const SKY_HOST_ID = "mediarecorder";
  const SKY_WINDOW_WIDTH = 520;
  const SKY_WINDOW_HEIGHT = 580;
  const skyWindowHost = () => (typeof window === "undefined" ? null : window.__skyAddonWindow);

  // 选项窗口单实例守卫：录制按钮可以被反复点按，但"录制选项页"只允许存在一份。
  // 未结束前再次点击直接复用同一个 Promise，不再新建 DOM、不再重复 mount（以前每次都
  // 会新建一份页面并挂到同一窗口里，于是窗口内出现多个录制页面）。
  let pendingOptions = null;

  // 顶栏按钮文字入口：按钮内含图标节点，直接写 textContent 会把图标一起清掉。
  const setRecordLabel = (text, title) => {
    if (recordLabel) recordLabel.textContent = text;
    if (typeof title === "string") recordElem.title = title;
  };

  while (true) {
    const elem = await addon.tab.waitForElement('div[class*="menu-bar_file-group"] > div:last-child:not(.sa-record)', {
      markAsSeen: true,
      reduxEvents: ["scratch-gui/mode/SET_PLAYER", "fontsLoaded/SET_FONTS_LOADED", "scratch-gui/locales/SELECT_LOCALE"],
    });
    const getOptions = () => {
      // 已有未结束的选项页 → 直接复用，保证窗口里永远只有一份录制页面
      if (pendingOptions) return pendingOptions;

      let resolvePromise = null;
      const optionPromise = new Promise((resolve) => {
        resolvePromise = resolve;
      });

      // ---- 窗口内容 DOM（与外壳无关，sky / 非 sky 共用同一份）----
      const body = Object.assign(document.createElement("div"), { className: "sa-recorder-body" });
      const content = Object.assign(document.createElement("div"), { className: "sa-recorder-content" });
      const footer = Object.assign(document.createElement("div"), { className: "sa-recorder-footer" });
      body.append(content, footer);

      content.appendChild(
        Object.assign(document.createElement("p"), {
          className: "sa-recorder-desc",
          textContent: msg("record-description", { extension: `.${fileExtension}` }),
        })
      );

      // ---- 参数卡片：录制时长 / 开始延迟 ----
      const recordOptionSecondsInput = Object.assign(document.createElement("input"), {
        type: "number",
        min: 1,
        max: 600,
        value: 30,
        id: "recordOptionSecondsInput",
        className: "sa-recorder-number",
      });
      const recordOptionDelayInput = Object.assign(document.createElement("input"), {
        type: "number",
        min: 0,
        max: 600,
        value: 0,
        id: "recordOptionDelayInput",
        className: "sa-recorder-number",
      });
      const makeFieldRow = (labelText, input) => {
        const row = Object.assign(document.createElement("label"), {
          className: "sa-recorder-field",
          htmlFor: input.id,
        });
        row.appendChild(
          Object.assign(document.createElement("span"), {
            className: "sa-recorder-field-label",
            textContent: labelText,
          })
        );
        row.appendChild(input);
        return row;
      };
      const paramsCard = Object.assign(document.createElement("div"), { className: "sa-recorder-card" });
      paramsCard.append(
        makeFieldRow(msg("record-duration"), recordOptionSecondsInput),
        makeFieldRow(msg("start-delay"), recordOptionDelayInput)
      );
      content.appendChild(paramsCard);

      // ---- 选项卡片：项目音频 / 麦克风 / 等待绿旗 / 停止时结束 ----
      const makeToggleInput = (id, checked) => {
        const input = Object.assign(document.createElement("input"), {
          type: "checkbox",
          id,
          className: "sa-recorder-toggle-input",
        });
        input.checked = checked;
        return input;
      };
      const recordOptionAudioInput = makeToggleInput("recordOptionAudioInput", true);
      const recordOptionMicInput = makeToggleInput("recordOptionMicInput", false);
      const recordOptionFlagInput = makeToggleInput("recordOptionFlagInput", true);
      const recordOptionStopInput = makeToggleInput("recordOptionStopInput", true);
      const makeToggleRow = (input, titleText, descText) => {
        const row = Object.assign(document.createElement("label"), {
          className: "sa-recorder-toggle",
          htmlFor: input.id,
        });
        if (descText) row.title = descText;
        const textWrap = Object.assign(document.createElement("span"), { className: "sa-recorder-toggle-text" });
        textWrap.appendChild(
          Object.assign(document.createElement("span"), {
            className: "sa-recorder-toggle-title",
            textContent: titleText,
          })
        );
        if (descText) {
          textWrap.appendChild(
            Object.assign(document.createElement("span"), {
              className: "sa-recorder-toggle-desc",
              textContent: descText,
            })
          );
        }
        const track = Object.assign(document.createElement("span"), { className: "sa-recorder-switch" });
        track.appendChild(Object.assign(document.createElement("span"), { className: "sa-recorder-switch-dot" }));
        row.append(textWrap, input, track);
        return row;
      };
      const flagRow = makeToggleRow(recordOptionFlagInput, msg("record-after-flag"));
      const stopRow = makeToggleRow(recordOptionStopInput, msg("record-until-stop"));
      const optionsCard = Object.assign(document.createElement("div"), { className: "sa-recorder-card" });
      optionsCard.append(
        makeToggleRow(recordOptionAudioInput, msg("record-audio"), msg("record-audio-description")),
        makeToggleRow(recordOptionMicInput, msg("record-mic")),
        flagRow,
        stopRow
      );
      content.appendChild(optionsCard);

      recordOptionFlagInput.addEventListener("change", () => {
        const disabled = (recordOptionStopInput.disabled = !recordOptionFlagInput.checked);
        stopRow.classList.toggle("is-disabled", disabled);
        if (disabled) {
          stopRow.title = msg("record-until-stop-disabled", {
            afterFlagOption: msg("record-after-flag"),
          });
        } else {
          stopRow.removeAttribute("title");
        }
      });

      // ---- 窗口生命周期（外壳由宿主 / 原版弹窗各自管理，这里只做解绑）----
      let settled = false;
      let skyHosted = false;
      let modalHandle = null;
      const teardown = () => {
        if (pendingOptions === optionPromise) pendingOptions = null;
        if (skyHosted) {
          skyHosted = false;
          const host = skyWindowHost();
          if (host) host.unmount(SKY_HOST_ID);
        }
        if (modalHandle) {
          modalHandle.remove();
          modalHandle = null;
        }
        if (body.parentNode) body.parentNode.removeChild(body);
      };
      const finish = (value) => {
        if (settled) return;
        settled = true;
        resolvePromise(value);
        teardown();
      };

      // ---- 底部操作区 ----
      const cancelButton = Object.assign(document.createElement("button"), {
        type: "button",
        className: "sa-recorder-btn sa-recorder-btn-secondary",
        textContent: msg("cancel"),
      });
      cancelButton.addEventListener("click", () => finish(null));
      const startButton = Object.assign(document.createElement("button"), {
        type: "button",
        className: "sa-recorder-btn sa-recorder-btn-primary",
      });
      startButton.appendChild(Object.assign(document.createElement("span"), { className: "sa-recorder-btn-dot" }));
      startButton.appendChild(Object.assign(document.createElement("span"), { textContent: msg("start") }));
      startButton.addEventListener(
        "click",
        () =>
          finish(
            {
              secs: Number(recordOptionSecondsInput.value),
              delay: Number(recordOptionDelayInput.value),
              audioEnabled: recordOptionAudioInput.checked,
              micEnabled: recordOptionMicInput.checked,
              waitUntilFlag: recordOptionFlagInput.checked,
              useStopSign: !recordOptionStopInput.disabled && recordOptionStopInput.checked,
            },
            true
          ),
        { once: true }
      );
      footer.append(cancelButton, startButton);

      // ---- 挂载：统一窗口宿主（外壳由 ThemedWindow 按主题分发：SKY → Win11 窗口，
      //      TurboWarp → 官方 Modal 弹窗），不再区分主题走各自弹窗实现 ----
      const host = skyWindowHost();
      if (host) {
        host.mount({
          id: SKY_HOST_ID,
          title: msg("option-title"),
          icon: RECORDER_ICON,
          width: SKY_WINDOW_WIDTH,
          height: SKY_WINDOW_HEIGHT,
          body,
          // 宿主标题栏关闭按钮 / Esc 触发
          onClose: () => finish(null),
        });
        skyHosted = true;
      } else {
        const modal = addon.tab.createModal(msg("option-title"), {
          isOpen: true,
          useEditorClasses: true,
        });
        modal.container.classList.add("sa-recorder-modal");
        modal.content.classList.add("sa-recorder-modal-content");
        modal.content.appendChild(body);
        modalHandle = { remove: modal.remove };
      }
      window.setTimeout(() => {
        if (!settled) recordOptionSecondsInput.focus();
      }, 80);

      // 登记为"当前唯一选项页"，后续点击复用这个 Promise
      pendingOptions = optionPromise;
      return optionPromise;
    };
    const disposeRecorder = () => {
      isRecording = false;
      recordElem.classList.remove("is-recording");
      setRecordLabel(msg("record"), "");
      recorder = null;
      recordBuffer = [];
      clearTimeout(timeout);
      timeout = 0;
      if (stopSignFunc) {
        addon.tab.traps.vm.runtime.off("PROJECT_STOP_ALL", stopSignFunc);
        stopSignFunc = null;
      }
    };
    const stopRecording = (force) => {
      if (isWaitingForFlag) {
        addon.tab.traps.vm.runtime.off("PROJECT_START", waitingForFlagFunc);
        isWaitingForFlag = false;
        waitingForFlagFunc = null;
        abortController.abort();
        abortController = null;
        disposeRecorder();
        return;
      }
      if (!isRecording || !recorder || recorder.state === "inactive") return;
      if (force) {
        disposeRecorder();
      } else {
        recorder.onstop = () => {
          const blob = new Blob(recordBuffer, { type: mimeType });
          downloadBlob(`${addon.tab.redux.state?.preview?.projectInfo?.title || "video"}.${fileExtension}`, blob);
          disposeRecorder();
        };
        recorder.stop();
      }
    };
    const startRecording = async (opts) => {
      // Timer
      const secs = Math.min(600, Math.max(1, opts.secs));

      // Initialize MediaRecorder
      recordBuffer = [];
      isRecording = true;
      const vm = addon.tab.traps.vm;
      let micStream;
      if (opts.micEnabled) {
        // Show permission dialog before green flag is clicked
        try {
          micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        } catch (e) {
          if (e.name !== "NotAllowedError" && e.name !== "NotFoundError") throw e;
          opts.micEnabled = false;
        }
      }
      if (opts.waitUntilFlag) {
        isWaitingForFlag = true;
        recordElem.classList.add("is-recording");
        setRecordLabel(msg("click-flag"), msg("click-flag-description"));
        abortController = new AbortController();
        try {
          await Promise.race([
            new Promise((resolve) => {
              waitingForFlagFunc = () => resolve();
              vm.runtime.once("PROJECT_START", waitingForFlagFunc);
            }),
            new Promise((_, reject) => {
              abortController.signal.addEventListener("abort", () => reject("aborted"), { once: true });
            }),
          ]);
        } catch (e) {
          if (e.message === "aborted") return;
          throw e;
        }
      }
      isWaitingForFlag = false;
      waitingForFlagFunc = abortController = null;
      const stream = new MediaStream();
      const videoStream = vm.runtime.renderer.canvas.captureStream();
      stream.addTrack(videoStream.getVideoTracks()[0]);

      const ctx = new AudioContext();
      const dest = ctx.createMediaStreamDestination();
      if (opts.audioEnabled) {
        const mediaStreamDestination = vm.runtime.audioEngine.audioContext.createMediaStreamDestination();
        vm.runtime.audioEngine.inputNode.connect(mediaStreamDestination);
        const audioSource = ctx.createMediaStreamSource(mediaStreamDestination.stream);
        audioSource.connect(dest);
      }
      if (opts.micEnabled) {
        const micSource = ctx.createMediaStreamSource(micStream);
        micSource.connect(dest);
      }
      if (opts.audioEnabled || opts.micEnabled) {
        stream.addTrack(dest.stream.getAudioTracks()[0]);
      }
      recorder = new MediaRecorder(stream, { mimeType });
      recorder.ondataavailable = (e) => {
        recordBuffer.push(e.data);
      };
      recorder.onerror = (e) => {
        console.warn("Recorder error:", e.error);
        stopRecording(true);
      };
      timeout = setTimeout(() => stopRecording(false), secs * 1000);
      if (opts.useStopSign) {
        stopSignFunc = () => stopRecording();
        vm.runtime.once("PROJECT_STOP_ALL", stopSignFunc);
      }

      // Delay
      const delay = opts.delay || 0;
      const roundedDelay = Math.floor(delay);
      for (let index = 0; index < roundedDelay; index++) {
        setRecordLabel(msg("starting-in", { secs: roundedDelay - index }));
        await new Promise((resolve) => setTimeout(resolve, 975));
      }
      setTimeout(
        () => {
          recordElem.classList.add("is-recording");
          setRecordLabel(msg("stop"));

          recorder.start(1000);
        },
        (delay - roundedDelay) * 1000
      );
    };
    if (!recordElem) {
      recordElem = Object.assign(document.createElement("div"), {
        className: "sa-record " + elem.className,
      });
      const recordIcon = Object.assign(document.createElement("span"), { className: "sa-record-icon" });
      recordIcon.innerHTML = RECORD_ICON_SVG;
      recordLabel = Object.assign(document.createElement("span"), {
        className: "sa-record-label",
        textContent: msg("record"),
      });
      recordIcon.setAttribute("aria-hidden", "true");
      recordElem.append(recordIcon, recordLabel);
      recordElem.addEventListener("click", async () => {
        if (isRecording) {
          stopRecording();
        } else {
          const opts = await getOptions();
          if (!opts) {
            console.log("Canceled");
            return;
          }
          startRecording(opts);
        }
      });
    }
    elem.parentElement.appendChild(recordElem);
  }
};

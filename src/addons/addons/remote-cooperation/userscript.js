/**
 * userscript.js —— 远程协作 addon（SKY Editor 前端 GUI 阶段）
 *
 * 职责：
 *   - 在 gui.jsx 新增的「远程协作」Tab 面板容器（.sky-remote-coop-panel）内
 *     注入 SKYEditor 风格协作窗口（连接配置 / 创建·加入·离开房间 / 成员列表 /
 *     同步状态 / 协作开关）。
 *   - 复用 backend-prototype 的同步语义：sync-client.js（浏览器版 CollabClient）
 *     + protocol.js（消息协议），对接轻量信令服务 ws://localhost:8090。
 *   - 遵守铁律：全程不碰 scratch-vm 内核，不修改上游组件逻辑，只消费
 *     gui.jsx 预留的空面板容器；关闭面板 / addon 被禁用时安全回退到积木页。
 *
 * 与 backend-prototype 的对接方式：
 *   - 信令服务：node src/server.js（backend-prototype 目录），默认 ws://localhost:8090
 *   - 协议：join / leave / relay(welcome / member-joined / member-left / sync)
 *   - 数据：init-state（全量）/ yjs-update（增量），Yjs CRDT 保证多端收敛
 */

import { SkySyncClient } from './sync-client.js';
import * as protocol from './protocol.js';
import createOpEngine from './op-engine.js';
import createBilupCompat from './bilup-compat.js';
import {ASSET_TEXT_FORMATS, bytesToBase64, forEachProjectAsset, collectAssetManifest, collectProjectAssets, injectSnapshotAssets} from './asset-snapshot.js';

export default async function ({ addon, console, msg }) {
  const waitFor = (selector) => addon.tab.waitForElement(selector, {
    markAsSeen: true,
    reduxEvents: ['scratch-gui/mode/SET_PLAYER', 'fontsLoaded/SET_FONTS_LOADED', 'scratch-gui/locales/SELECT_LOCALE'],
    reduxCondition: (state) => !state.scratchGui.mode.isPlayerOnly,
  });

  // -------------------------------------------------------------------------
  // 状态与配置
  // -------------------------------------------------------------------------
  const state = {
    status: 'idle', // idle | connecting | connected | error
    roomId: null,
    client: null,
    members: [],
    collabOn: false,
    snapSyncOn: true,
    opSyncOn: true, // 操作级同步开关（与快照同步并行，细粒度编辑实时同步）
    lastActivity: null, // { from, kind, at }
    remoteSnapshots: [], // 收到的远端项目快照 { from, displayName, projectJson, at }
    presence: {}, // 在线成员编辑状态：clientId -> { targetId, targetName, at }（不含自己）
  };

  // vm 为惰性获取：addon.tab.traps.vm 是动态 getter（每次访问实时读 redux），
  // 而 vm 经 SET_VM / vm-manager-hoc componentDidMount 注入，addon 早期访问时为 undefined。
  // 必须在 waitFor 编辑器容器成功（GUI 渲染完成后）再调用 getVm() 才能拿到真实 vm。
  const getVm = () => {
    try {
      return addon.tab.traps.vm;
    } catch (e) {
      console.warn('[remote-coop] 无法获取 vm', e);
      return null;
    }
  };

  // -------------------------------------------------------------------------
  // 生成房间号 / 客户端 ID
  // -------------------------------------------------------------------------
  const genRoomId = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let s = '';
    for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
    return `SKY-${s}`;
  };
  const genClientId = () => `c-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const clientId = genClientId();

  // -------------------------------------------------------------------------
  // DOM 构建（SKYEditor 风格窗口面板）
  // -------------------------------------------------------------------------
  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };

  const root = el('div', 'sa-remote-coop');
  const shadow = el('div', 'sa-remote-coop-shadow');

  // 标题栏
  const header = el('div', 'rc-header');
  const headerLeft = el('div', 'rc-header-left');
  const titleIcon = el('div', 'rc-title-icon');
  const title = el('div', 'rc-title', '远程协作 Remote Coop');
  headerLeft.append(titleIcon, title);
  const statusDot = el('span', 'rc-status-dot rc-status-idle');
  const statusText = el('span', 'rc-status-text', '未连接');
  const statusBox = el('div', 'rc-status-box');
  statusBox.append(statusDot, statusText);
  const closeBtn = el('button', 'rc-close-btn', '×');
  closeBtn.title = '关闭面板（回到积木页）';
  header.append(headerLeft, statusBox, closeBtn);

  // 连接配置区
  const cardConfig = el('div', 'rc-card');
  const cfgTitle = el('div', 'rc-card-title', '连接配置');
  const serverRow = el('div', 'rc-row');
  const serverLabel = el('label', 'rc-label', '服务地址');
  const serverInput = el('input', 'rc-input rc-input-server');
  serverInput.type = 'text';
  serverInput.value = 'ws://localhost:8090';
  serverInput.placeholder = 'ws://localhost:8090';
  serverRow.append(serverLabel, serverInput);
  const nameRow = el('div', 'rc-row');
  const nameLabel = el('label', 'rc-label', '昵称');
  const nameInput = el('input', 'rc-input rc-input-name');
  nameInput.type = 'text';
  nameInput.value = localStorage.getItem('sky-remote-coop-name') || `创作者${String(Math.floor(Math.random() * 900) + 100)}`;
  nameInput.placeholder = '匿名昵称';
  nameRow.append(nameLabel, nameInput);
  cardConfig.append(cfgTitle, serverRow, nameRow);

  // 房间操作区
  const cardRoom = el('div', 'rc-card');
  const roomTitle = el('div', 'rc-card-title', '房间');
  const roomIdBox = el('div', 'rc-room-id', '未加入房间');
  const createBtn = el('button', 'rc-btn rc-btn-primary', '创建房间');
  const joinRow = el('div', 'rc-row rc-join-row');
  const joinInput = el('input', 'rc-input rc-input-room');
  joinInput.type = 'text';
  joinInput.placeholder = '输入房间号，如 SKY-ABCDEF';
  const joinBtn = el('button', 'rc-btn rc-btn-secondary', '加入房间');
  joinRow.append(joinInput, joinBtn);
  const leaveBtn = el('button', 'rc-btn rc-btn-danger rc-btn-leave', '离开房间');
  leaveBtn.disabled = true;
  cardRoom.append(roomTitle, roomIdBox, createBtn, joinRow, leaveBtn);

  // 成员列表区
  const cardMembers = el('div', 'rc-card');
  const membersTitle = el('div', 'rc-card-title', '成员');
  const membersCount = el('span', 'rc-count', '0');
  membersTitle.append(membersCount);
  const membersList = el('div', 'rc-members');
  const membersEmpty = el('div', 'rc-members-empty', '加入房间后显示在线成员');
  membersList.appendChild(membersEmpty);
  cardMembers.append(membersTitle, membersList);

  // 同步状态区
  const cardSync = el('div', 'rc-card');
  const syncTitle = el('div', 'rc-card-title', '同步状态');
  const syncDetail = el('div', 'rc-sync-detail', '等待连接…');
  const activityLine = el('div', 'rc-activity', '');
  cardSync.append(syncTitle, syncDetail, activityLine);

  // 协作开关区
  const cardToggle = el('div', 'rc-card rc-card-toggle');
  const toggleInfo = el('div', 'rc-toggle-info');
  const toggleTitle = el('div', 'rc-toggle-title', '协作开关');
  const toggleDesc = el('div', 'rc-toggle-desc', '启用后连接信令服务并加入房间，与协作者实时同步');
  toggleInfo.append(toggleTitle, toggleDesc);
  const toggleWrap = el('label', 'rc-switch');
  const toggleCheck = el('input', 'rc-switch-input');
  toggleCheck.type = 'checkbox';
  const toggleSlider = el('span', 'rc-switch-slider');
  toggleWrap.append(toggleCheck, toggleSlider);
  cardToggle.append(toggleInfo, toggleWrap);

  // 快照同步开关区
  const cardSnap = el('div', 'rc-card rc-card-toggle');
  const snapInfo = el('div', 'rc-toggle-info');
  const snapTitle = el('div', 'rc-toggle-title', '项目快照同步');
  const snapDesc = el('div', 'rc-toggle-desc', '房间内自动交换项目快照（改动实时同步），收到远端快照自动应用（含防循环抑制）');
  snapInfo.append(snapTitle, snapDesc);
  const snapWrap = el('label', 'rc-switch');
  const snapCheck = el('input', 'rc-switch-input');
  snapCheck.type = 'checkbox';
  snapCheck.checked = true;
  const snapSlider = el('span', 'rc-switch-slider');
  snapWrap.append(snapCheck, snapSlider);
  cardSnap.append(snapInfo, snapWrap);

  // 远端快照区（动态）
  const cardRemoteSnaps = el('div', 'rc-card rc-card-remote-snaps');
  const rsTitle = el('div', 'rc-card-title', '远端项目快照');
  const rsList = el('div', 'rc-remote-snaps');
  cardRemoteSnaps.append(rsTitle, rsList);
  cardRemoteSnaps.style.display = 'none';

  root.append(shadow, header, cardConfig, cardRoom, cardMembers, cardSync, cardToggle, cardSnap, cardRemoteSnaps);

  // -------------------------------------------------------------------------
  // UI 更新辅助
  // -------------------------------------------------------------------------
  const setStatus = (status, text) => {
    state.status = status;
    statusDot.className = `rc-status-dot rc-status-${status}`;
    statusText.textContent = text;
  };
  const setRoomIdUI = (roomId) => {
    state.roomId = roomId;
    roomIdBox.textContent = roomId ? `房间号：${roomId}` : '未加入房间';
    leaveBtn.disabled = !roomId;
  };
  const colorForId = (id) => {
    // 按 clientId 哈希生成稳定成员色（HSL 色相 0-360）
    let h = 0;
    for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 360;
    return `hsl(${h}, 70%, 55%)`;
  };
  // 自己当前正在编辑的角色名（用于列表内“我”的状态展示）
  const selfEditingName = () => {
    try {
      const vm = getVm();
      const t = vm && vm.editingTarget;
      return t ? (t.getName ? t.getName() : t.name) : null;
    } catch (e) {
      return null;
    }
  };
  const renderMembers = () => {
    membersCount.textContent = String(state.members.length);
    membersList.innerHTML = '';
    if (state.members.length === 0) {
      membersList.appendChild(el('div', 'rc-members-empty', '房间内暂无其他成员'));
      return;
    }
    for (const m of state.members) {
      const row = el('div', 'rc-member');
      const avatar = el('span', 'rc-avatar', (m.displayName || '?').slice(0, 1).toUpperCase());
      avatar.style.background = colorForId(m.clientId);
      const name = el('span', 'rc-member-name', m.displayName || m.clientId);
      const tag = m.clientId === clientId ? el('span', 'rc-tag', '我') : null;
      const mine = m.clientId === clientId;
      const editingName = mine ? selfEditingName() : (state.presence[m.clientId] || {}).targetName;
      const editing = el('span', 'rc-presence', editingName ? `正在编辑：${editingName}` : '空闲中');
      row.append(avatar, name);
      if (tag) row.appendChild(tag);
      row.appendChild(editing);
      // presence 增强：点击远端成员行跳转到其正在编辑的角色（需已上报 presence 目标）
      if (!mine) {
        const p = state.presence[m.clientId];
        if (p && p.targetId) {
          row.classList.add('rc-member-jump');
          row.title = `跳转到 ${m.displayName || m.clientId} 正在编辑的角色`;
          row.addEventListener('click', () => {
            try {
              const vm = getVm();
              if (vm && typeof vm.setEditingTarget === 'function') vm.setEditingTarget(p.targetId);
            } catch (e) { /* ignore */ }
          });
        }
      }
      membersList.appendChild(row);
    }
  };
  const setActivity = (text) => {
    activityLine.textContent = text;
  };
  const fmtTime = (t) => {
    const d = new Date(t);
    return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
  };
  const setBusy = (busy) => {
    createBtn.disabled = busy;
    joinBtn.disabled = busy;
  };

  // -------------------------------------------------------------------------
  // 在线成员状态（presence）：周期性广播当前编辑目标，供成员列表展示
  // -------------------------------------------------------------------------
  let presenceTimer = null;
  let lastPresenceKey = null;

  const getSpriteItems = () => {
    // 优先容器类名（scratch-gui 角色面板条目），兼容 hash 类名
    const items = document.querySelectorAll('[class*="sprite-selector-item"], .sprite-selector-item');
    return Array.from(items);
  };
  const spriteItemName = (item) => {
    const n = item.querySelector('[class*="sprite-selector-item-name"], .sprite-selector-item-name');
    return n ? n.textContent.trim() : '';
  };
  // 角色面板在线编辑指示：为被远端成员正在编辑的角色条目加彩色圆点
  const renderPresenceBadges = () => {
    try {
      // 清理陈旧 presence（超过 8s 未更新视为失效，成员列表同步刷新）
      const now = Date.now();
      let dirty = false;
      for (const k of Object.keys(state.presence)) {
        if (now - state.presence[k].at > 8000) {
          delete state.presence[k];
          dirty = true;
        }
      }
      if (dirty) renderMembers();
      // 汇总：targetName -> 成员色列表
      const active = new Map();
      for (const k of Object.keys(state.presence)) {
        const p = state.presence[k];
        if (p && p.targetName) {
          if (!active.has(p.targetName)) active.set(p.targetName, []);
          active.get(p.targetName).push(colorForId(k));
        }
      }
      const items = getSpriteItems();
      for (const item of items) {
        const name = spriteItemName(item);
        const colors = active.get(name);
        let badge = item.querySelector('.rc-sprite-badge');
        if (colors && colors.length) {
          if (!badge) {
            badge = el('span', 'rc-sprite-badge');
            if (getComputedStyle(item).position === 'static') item.style.position = 'relative';
            item.appendChild(badge);
          }
          badge.style.background = colors[0];
          badge.title = `协作者正在编辑：${name}`;
        } else if (badge) {
          badge.remove();
        }
      }
      // 舞台在线光标（跟随远端成员正在编辑的角色当前位置）
      renderStageCursors();
    } catch (e) { /* ignore */ }
  };

  // 舞台在线光标：把远端成员的编辑目标位置换算成舞台像素坐标并叠加指示器
  // 增量更新：位置不变时不写 DOM，位置/成员变化时仅更新对应节点，避免闪烁
  const renderStageCursors = () => {
    try {
      const stage = document.querySelector('[class*="stage_stage"], .stage_stage');
      if (!stage) return;
      if (getComputedStyle(stage).position === 'static') stage.style.position = 'relative';
      const vm = getVm();
      if (!vm) return;
      let layer = stage.querySelector(':scope > .rc-cursor-layer');
      if (!layer) {
        layer = el('div', 'rc-cursor-layer');
        stage.appendChild(layer);
      }
      const rect = stage.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const seen = new Set();
      for (const k of Object.keys(state.presence)) {
        const p = state.presence[k];
        if (!p || !p.targetId) continue;
        const t = vm.runtime.getTargetById(p.targetId);
        if (!t || t.isStage) continue;
        const member = state.members.find((m) => m.clientId === k);
        const display = member ? member.displayName : k.slice(0, 4);
        const px = Math.round(((t.x + 240) / 480) * rect.width);
        const py = Math.round(((180 - t.y) / 360) * rect.height);
        const key = `${k}|${p.targetId}|${px}|${py}`;
        seen.add(k);
        let cur = layer.querySelector(`[data-cid="${k}"]`);
        if (!cur) {
          cur = el('div', 'rc-cursor');
          cur.dataset.cid = k;
          cur.style.borderColor = colorForId(k);
          const label = el('span', 'rc-cursor-name', display);
          label.style.background = colorForId(k);
          cur.appendChild(label);
          layer.appendChild(cur);
        }
        if (cur.dataset.key !== key) {
          cur.dataset.key = key;
          cur.style.left = `${px}px`;
          cur.style.top = `${py}px`;
        }
      }
      // 移除已不在 presence 中的指示器
      for (const cur of Array.from(layer.querySelectorAll('.rc-cursor'))) {
        if (!seen.has(cur.dataset.cid)) cur.remove();
      }
    } catch (e) { /* ignore */ }
  };

  const broadcastPresence = () => {
    try {
      const vm = getVm();
      const t = vm && vm.editingTarget;
      const targetId = t ? t.id : null;
      const targetName = t ? (t.getName ? t.getName() : t.name) : null;
      const key = `${targetId || ''}|${targetName || ''}`;
      // 每次 tick 刷新角色面板在线编辑圆点（低开销，DOM 有变化才实际改动）
      renderPresenceBadges();
      if (key === lastPresenceKey) return;
      lastPresenceKey = key;
      if (currentClient && state.collabOn) {
        currentClient.sendRelay(protocol.KIND_PRESENCE, { targetId, targetName });
      }
      // 同步刷新列表内“我”的状态行（不整表重绘）
      for (const row of membersList.querySelectorAll('.rc-member')) {
        const isMine = row.querySelector('.rc-tag');
        if (isMine) {
          const editing = row.querySelector('.rc-presence');
          if (editing) editing.textContent = targetName ? `正在编辑：${targetName}` : '空闲中';
        }
      }
    } catch (e) { /* ignore */ }
  };
  const presenceStart = () => {
    if (presenceTimer) return;
    lastPresenceKey = null;
    broadcastPresence();
    presenceTimer = setInterval(broadcastPresence, 800);
  };
  const presenceStop = () => {
    if (presenceTimer) {
      clearInterval(presenceTimer);
      presenceTimer = null;
    }
    lastPresenceKey = null;
  };

  // -------------------------------------------------------------------------
  // 协作客户端生命周期
  // -------------------------------------------------------------------------
  let currentClient = null;
  // 操作级同步引擎（op-engine.js，Bilup 思路移植）：collabOn 后与快照同步并行。
  // 引擎在首次加入房间时创建，离开房间 / addon 禁用时销毁，全程不碰 scratch-vm 内核。
  let opEngine = null;
  // Bilup 兼容模式（bilup-compat.js）：与方案A 互斥，同一时刻只能一种连接模式。
  // bilupActive 由 bilupCompat 的 onStateChange 回调维护；为 true 时 op-engine 的
  // sendOp / sendAssetRequest 路由到 bilupCompat.handleLocalOp / handleLocalAssetRequest。
  let bilupCompat = null;
  let bilupActive = false;

  const ensureOpEngine = () => {
    const vm = getVm();
    if (!vm || opEngine) return opEngine;
    opEngine = createOpEngine({
      vm,
      // 块事件捕获需要主 workspace；Blockly 挂在 window.ScratchBlocks
      getWorkspace: () => {
        try {
          const SB = window.ScratchBlocks;
          return SB && typeof SB.getMainWorkspace === 'function' ? SB.getMainWorkspace() : null;
        } catch (e) {
          return null;
        }
      },
      // 快照应用期（applyingRemote）也抑制 op 捕获，避免 loadProject 产生海量 echo op
      isSuppressed: () => applyingRemote,
      sendOp: (type, payload) => {
        // Bilup 兼容模式：本地编辑转为 Bilup propose 信封（由兼容层提交 host 定序）
        if (bilupActive && bilupCompat) {
          try {
            bilupCompat.handleLocalOp(type, payload);
          } catch (e) {
            console.warn('[remote-coop] Bilup op 发送失败', e);
          }
          return;
        }
        if (!state.collabOn || !currentClient || !state.opSyncOn) return;
        try {
          // 资产先行因果序（借鉴 Bilup）：op 携带 assetRefs 时，先把资产字节广播给
          // 房间（幂等，接收端注入 storage 缓存），再发 op；接收端 applyRemoteOp 的
          // requestAssets 通常可直接命中本地缓存，减少按需拉取往返。不破坏原有
          // asset-request / asset-data 流程（缺资产仍走定向拉取）。
          const refs = (payload && Array.isArray(payload.assetRefs)) ? payload.assetRefs : [];
          if (refs.length) {
            const assetIds = new Set(refs.map((r) => String(r).split('.')[0]));
            const assets = collectProjectAssets(getVm(), assetIds);
            if (assets.length) {
              try {
                currentClient.sendRelay(protocol.KIND_ASSET_DATA, { assets }, null);
              } catch (e) {
                console.warn('[remote-coop] 资产先行广播失败', e);
              }
            }
          }
          // 中心定序：信令服务会为广播 op 打中心序号（seq）并 echo 回本端，
          // 本端据此推进 lastSeq；opSeq 仅为本地诊断序号，不参与收敛（去重/排序以 seq 为准）。
          localOpSeq += 1;
          currentClient.sendRelay(protocol.KIND_OP, { type, payload, opSeq: localOpSeq });
        } catch (e) {
          console.warn('[remote-coop] op 发送失败', e);
        }
      },
      sendAssetRequest: (assetIds, toClientId) => {
        // Bilup 兼容模式：资产按 Bilup ASSET.REQUEST 通道定向请求
        if (bilupActive && bilupCompat) {
          try {
            bilupCompat.handleLocalAssetRequest(assetIds, toClientId);
          } catch (e) {
            console.warn('[remote-coop] Bilup asset 请求失败', e);
          }
          return;
        }
        if (!state.collabOn || !currentClient || !toClientId) return;
        try {
          currentClient.sendRelay(protocol.KIND_ASSET_REQUEST, { assetIds }, toClientId);
        } catch (e) {
          console.warn('[remote-coop] op asset 请求失败', e);
        }
      },
    });
    opEngine.start();
    console.log('[remote-coop] 操作级同步引擎已启动（细粒度编辑实时同步）');
    return opEngine;
  };

  const destroyOpEngine = () => {
    if (opEngine) {
      try {
        opEngine.destroy();
      } catch (e) {
        console.warn('[remote-coop] op 引擎销毁失败', e);
      }
      opEngine = null;
    }
  };

  const makeDisplayName = () => nameInput.value.trim() || `匿名-${clientId.slice(0, 4)}`;

  const startJoin = async (roomId) => {
    if (state.collabOn && currentClient) return;
    // Bilup 兼容模式与方案A 互斥：已处于 Bilup 房间时拒绝方案A 加入
    if (bilupActive) {
      setActivity('已处于 Bilup 兼容模式，请先离开 Bilup 房间');
      return;
    }
    // 异常断开后的自动重连：state.collabOn 仍为 true 且 currentClient 已被清空
    const isReconnect = state.collabOn && !currentClient;
    const url = (serverInput.value.trim() || 'ws://localhost:8090').replace(/\/+$/, '');
    if (!/^wss?:\/\//i.test(url)) {
      setStatus('error', '服务地址需以 ws:// 或 wss:// 开头');
      return;
    }
    setStatus('connecting', '连接信令服务…');
    setBusy(true);
    const client = new SkySyncClient({
      url,
      roomId,
      clientId,
      displayName: makeDisplayName(),
      onEvent: handleClientEvent,
    });
    currentClient = client;
    try {
      await client.connect();
      // 连接成功后即视为协作启用
      state.collabOn = true;
      state.roomId = roomId;
      toggleCheck.checked = true;
      reconnectAttempts = 0; // 自动重连成功：重置重试计数
      setStatus('connected', '已连接');
      setRoomIdUI(roomId);
      setActivity(`已加入房间 ${roomId}，等待同步…`);
      // 启动操作级同步引擎（细粒度编辑实时同步，与快照同步并行）
      ensureOpEngine();
      // 启动在线成员状态广播（低频率，成员列表显示谁在编辑什么）
      presenceStart();
    } catch (e) {
      currentClient = null;
      state.collabOn = false;
      toggleCheck.checked = false;
      setStatus('error', e.message || '连接失败');
      setActivity('');
      console.error('[remote-coop]', e);
      // 重连模式下连接失败：保留房间与 lastSeq，继续按间隔重试（断线重连补偿）
      if (isReconnect && state.roomId) {
        scheduleReconnect();
      }
    } finally {
      setBusy(false);
    }
  };

  const stopCollab = (silent) => {
    if (currentClient) {
      try {
        currentClient.leave();
      } catch (e) { /* ignore */ }
    }
    currentClient = null;
    state.collabOn = false;
    toggleCheck.checked = false;
    // 离开协作：销毁操作级同步引擎（还原 VM patch、解绑 workspace 监听）
    destroyOpEngine();
    // 停止在线成员状态广播并清空远端状态
    presenceStop();
    cancelCatchup();
    cancelPendingCatchup();
    localOpSeq = 0;
    opSeqWatermark = 0;
    lastSeq = null;
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    reconnectAttempts = 0;
    state.presence = {};
    renderPresenceBadges();
    state.members = [];
    setRoomIdUI(null);
    renderMembers();
    if (!silent) {
      setStatus('idle', '未连接');
      setActivity('');
      syncDetail.textContent = '等待连接…';
    }
  };

  function handleClientEvent(event, data) {
    switch (event) {
      case 'welcome':
        state.members = (data.members || []).slice();
        renderMembers();
        syncDetail.textContent = `房间成员 ${state.members.length} 人`;
        // 中心定序对齐：首次入房用服务端房间当前序号初始化 lastSeq（快照覆盖此前所有 op
        // 的效果，可直接对齐）；断线重连时保留已推进的 lastSeq，并主动拉取断线期间的
        // 差值 op 补偿（welcome 的 opSeq 只用于首次初始化，重连不可重置 lastSeq）。
        if (lastSeq === null) {
          lastSeq = (typeof data.opSeq === 'number') ? data.opSeq : 0;
        } else {
          requestCatchup();
        }
        // 加入/重连补偿：进入 op 缓冲窗口，等对端 init-state（全量快照）到达；
        // 窗口内收到的增量 op 先缓存不落地，避免落在旧项目结构上造成乱序覆盖。
        enterCatchup();
        break;
      case 'member-joined':
        state.members = currentClient ? currentClient.getMembers() : state.members;
        renderMembers();
        syncDetail.textContent = `成员 ${data.displayName || data.clientId} 加入`;
        setActivity(`${fmtTime(Date.now())} ${data.displayName || data.clientId} 加入了房间`);
        break;
      case 'member-left':
        state.members = currentClient ? currentClient.getMembers() : state.members;
        delete state.presence[data.clientId];
        renderMembers();
        syncDetail.textContent = '成员离开';
        setActivity(`${fmtTime(Date.now())} 有成员离开房间`);
        break;
      case 'sync-activity': {
        const snap = data.snapshot || {};
        // 检查是否收到远端项目快照
        for (const key of Object.keys(snap)) {
          if (key.startsWith('project:') && key !== `project:${clientId}`) {
            const fromClientId = key.slice('project:'.length);
            const member = state.members.find((m) => m.clientId === fromClientId);
            const displayName = member ? member.displayName : fromClientId;
            pushRemoteSnapshot(displayName, fromClientId, snap[key]);
          }
        }
        const fromName = (() => {
          const m = state.members.find((mm) => mm.clientId === data.from);
          return m ? m.displayName : data.from;
        })();
        setActivity(`${fmtTime(data.at)} 收到 ${fromName} 的${data.kind === 'init-state' ? '全量状态' : '增量更新'}`);
        break;
      }
      case 'data':
        syncDetail.textContent = '正在同步数据…';
        break;
      case 'asset-request': {
        // 房间内某端应用快照时发现本地缺 asset，向本端定向请求数据：
        // 从本地 storage/targets 按 assetId 收集编码后回传（一次回传全部请求项）。
        const assetIds = (data && data.assetIds) || [];
        if (!assetIds.length || !currentClient) break;
        const list = collectProjectAssets(getVm(), new Set(assetIds));
        if (list.length) {
          currentClient.sendRelay(protocol.KIND_ASSET_DATA, { assets: list }, data.from);
        }
        break;
      }
      case 'asset-data': {
        // 收到远端回传的 asset 数据：先注入本地 storage 缓存；
        // 同时唤醒 op 引擎中等待该批 asset 的排队 op（操作级同步资产就绪）；
        // 若正处于等待 asset 的挂起状态（assetWait），逐项核对缺失清单并尝试继续。
        const assets = (data && data.assets) || [];
        if (assets.length) {
          injectSnapshotAssets({ assets }, getVm());
          if (opEngine) opEngine.injectAssetData(assets);
        }
        if (assetWait) {
          const pending = assetWait.missing;
          for (const item of assets) pending.delete(item.assetId);
          if (pending.size === 0) {
            finishAssetWait();
          }
        }
        break;
      }
      case 'op': {
        // 操作级同步：远端单条编辑 op，交给 op 引擎串行应用。
        // 应用期间与快照应用一致：置抑制窗 + 远端深度计数，防止应用 echo 触发快照推送或 op 捕获。
        if (!data || !data.type) break;
        // 监视器全量同步（内部类型，不经 op 串行队列，直接整体应用对齐）
        if (data.type === 'monitor-sync') {
          applyMonitorFullSync(data.payload);
          break;
        }
        // 监视器全量请求：快照应用方 loadProject 后监视器被清空，向其回发本端监视器全量
        if (data.type === 'monitor-request') {
          broadcastMonitorsFull();
          break;
        }
        if (!opEngine) break;
        // 兼容新旧协议：新协议在 sync-client 已解包（data.payload 为载荷本体），
        // 旧协议仍为 { type, payload } 整包，做一次兜底解包。
        const opBody = (data.payload && typeof data.payload === 'object' && 'payload' in data.payload)
          ? data.payload.payload : data.payload;
        // 中心序号：服务端注入的 seq 为定序/去重基准；opSeq 为旧协议客户端序号（仅诊断）
        const seq = (typeof data.seq === 'number')
          ? data.seq
          : ((data.payload && typeof data.payload.seq === 'number') ? data.payload.seq : null);
        // 自己发出的 op echo：本地已应用，仅推进 lastSeq（保持中心序号对齐，供 catchup 定界）
        if (data.from === clientId) {
          if (typeof seq === 'number' && (lastSeq === null || seq > lastSeq)) lastSeq = seq;
          if (typeof seq === 'number' && seq > opSeqWatermark) opSeqWatermark = seq;
          break;
        }
        // 中心序号去重：已应用过的旧 op（含重连/补偿期已落地或快照覆盖过的）直接跳过
        if (typeof seq === 'number' && lastSeq !== null && seq <= lastSeq) break;
        // 快照应用期缓冲：loadProject 异步窗口内到达的实时 op 先缓存不落地，
        // 由 doApplySnapshot 应用完成后按中心序号升序落地（快照为权威全量）
        if (snapshotApplying) {
          if (bufferedOps.length < MAX_BUFFERED_OPS) {
            bufferedOps.push({ type: data.type, payload: opBody, from: data.from, seq });
          }
          break;
        }
        // 重连补偿期：先缓冲，窗口结束后按中心序号升序串行落地（快照到达时被清空）
        if (opBufferActive()) {
          if (bufferedOps.length < MAX_BUFFERED_OPS) {
            bufferedOps.push({ type: data.type, payload: opBody, from: data.from, seq });
          }
          break;
        }
        // catchup 在途：先入补偿缓冲，收到历史回传后按 seq 升序合并落地
        if (pendingCatchup) {
          if (pendingCatchup.buffer.length < MAX_BUFFERED_OPS) {
            pendingCatchup.buffer.push({ type: data.type, payload: opBody, from: data.from, seq });
          }
          break;
        }
        applyRemoteOpWithSeq(data.type, opBody, { from: data.from }, seq);
        break;
      }
      case 'op-catchup': {
        // 服务端历史补偿回传（断线重连/入房后按 since 拉回的差值 op）：
        // 升序合并应用历史 op + 在途缓冲实时 op，去重后依次落地
        applyCatchupResult((data && data.ops) || []);
        break;
      }
      case 'presence': {
        // 在线成员状态：记录远端正在编辑的目标并刷新成员列表
        if (!data || !data.from) break;
        state.presence[data.from] = {
          targetId: data.targetId || null,
          targetName: data.targetName || null,
          at: Date.now(),
        };
        renderMembers();
        renderPresenceBadges();
        break;
      }
      case 'disconnected':
        if (currentClient === null) return;
        currentClient = null;
        presenceStop();
        cancelCatchup();
        cancelPendingCatchup();
        state.presence = {};
        renderPresenceBadges();
        // 异常断开自动重连：保留房间与已推进的 lastSeq，重连成功 welcome 后
        // 主动 requestCatchup 拉回断线期间的差值 op（断线重连补偿）。
        // 用户主动 stopCollab 时 collabOn 已为 false，不触发自动重连。
        if (state.collabOn && state.roomId) {
          scheduleReconnect();
        } else {
          state.collabOn = false;
          toggleCheck.checked = false;
          setStatus('idle', '连接已断开');
          setActivity('');
        }
        break;
      default:
        break;
    }
  }

  // -------------------------------------------------------------------------
  // 远端项目快照（自动实时同步：收到即自动应用，防循环由全局抑制窗口保证）
  // -------------------------------------------------------------------------
  function pushRemoteSnapshot(displayName, fromClientId, projectJson) {
    if (!projectJson || typeof projectJson !== 'object') return;
    // 去重键统一使用快照自身的 updatedAt（发送方注入的时间），与下方 at 保持一致
    if (state.remoteSnapshots.some((s) => s.fromClientId === fromClientId && s.at === projectJson.updatedAt)) return;
    state.remoteSnapshots.push({
      displayName,
      fromClientId,
      projectJson,
      at: projectJson.updatedAt || Date.now(),
    });
    renderRemoteSnaps();
    // 自动实时同步：收到远端快照即自动应用，无需手动点击
    applyRemoteSnapshot(state.remoteSnapshots[state.remoteSnapshots.length - 1]);
  }

  // ---- asset 按需拉取状态 ----
  // 应用远端快照时，若清单内 asset 本地 storage 缺失，向快照来源定向请求；
  // 收到 asset-data 逐项注入缓存，全部到齐（或超时兜底）后执行 loadProject。
  let assetWait = null; // { missing: Map<assetId, dataFormat>, snap, timer }

  // 所有缺失 asset 已到齐：清理等待状态并执行快照应用。
  function finishAssetWait() {
    if (!assetWait) return;
    const wait = assetWait;
    assetWait = null;
    if (wait.timer) clearTimeout(wait.timer);
    doApplySnapshot(wait.snap, getVm());
  }

  // 自动应用远端快照。全程带防循环：
  //   - applyingRemote 标志 + suppressPushUntil 时间窗，抑制应用触发的本端 echo 推送；
  //   - 推送端再做前后内容对比兜底（见 maybePushProjectSnapshot）；
  //   - 应用成功后立即把 lastPushedRaw/lastPushedTitle 更新为应用后内容，
  //     使内容对比能拦截对端的回声快照（修复回声互推）。
  // asset 处理（按需拉取）：
  //   - 快照只携带引用清单；本地 storage 未命中的项向快照来源定向请求 asset-data，
  //     到齐后注入缓存再 loadProject，避免整包传输拖慢同步；
  //   - 5s 超时按已到数据兜底应用，缺失项由下方结构校验拦截异常缩水。
  function applyRemoteSnapshot(snap) {
    const vm = getVm();
    if (!vm || !snap) return;
    enterRemoteApply();
    suppressPushUntil = Math.max(suppressPushUntil, Date.now() + SUPPRESS_WINDOW_MS);
    try {
      const manifest = (snap.projectJson && snap.projectJson.assets) || [];
      const storage = vm.runtime ? vm.runtime.storage : null;
      const missing = new Map(); // assetId -> dataFormat
      for (const item of manifest) {
        if (!item || !item.assetId) continue;
        let hit = false;
        if (storage) {
          const cached = storage.get(item.assetId);
          if (cached && cached.data && cached.data.length > 0) hit = true;
        }
        if (!hit) missing.set(item.assetId, item.dataFormat || '');
      }
      if (missing.size === 0 || !currentClient || !snap.fromClientId) {
        // 本地已全量具备（或无法发起请求），直接应用
        doApplySnapshot(snap, vm);
        return;
      }
      // 发起按需拉取，超时后按已到数据兜底应用
      const wait = {
        missing,
        snap,
        timer: setTimeout(() => {
          if (assetWait === wait) {
            assetWait = null;
            setActivity(`${fmtTime(Date.now())} asset 拉取超时，按已到数据应用 ${snap.displayName} 的快照`);
            doApplySnapshot(snap, vm);
          }
        }, 5000),
      };
      assetWait = wait;
      currentClient.sendRelay(protocol.KIND_ASSET_REQUEST, { assetIds: Array.from(missing.keys()) }, snap.fromClientId);
      setActivity(`${fmtTime(Date.now())} 快照缺少 ${missing.size} 个素材，正在按需拉取…`);
    } catch (e) {
      exitRemoteApply();
      setActivity(`自动应用快照失败：${e.message}`);
    }
  }

  // 执行快照应用（asset 已就绪后调用）。含防循环与内容校验。
  function doApplySnapshot(snap, vm) {
    try {
      // 全量快照将整体替换项目：先清空 op 引擎排队中的旧增量，
      // 避免旧 op 在 loadProject 后落到错乱的目标 id 上；同时清空重连缓冲与在途补偿
      //（快照为权威全量，缓冲窗口内暂存的旧增量、在途 catchup 请求均直接作废，
      //  快照应用成功后以快照携带的 opSeq 重新对齐并重新请求差值补偿）。
      if (opEngine) opEngine.reset();
      cancelCatchup();
      cancelPendingCatchup();
      // 快照应用为权威全量：loadProject 异步期间到达的实时 op 一律先缓冲，
      // 待项目加载完成、lastSeq 对齐到快照 opSeq 后再按中心序号升序串行落地
      //（seq <= lastSeq 由 applyRemoteOpWithSeq 去重跳过），避免增量 op 落在旧项目结构上。
      snapshotApplying = true;
      // 1) 兼容旧协议/重放：若快照仍携带 asset 数据，先注入本地 storage 缓存再 loadProject，
      //    确保 loadCostume/loadSound 的 storage.load 命中本地缓存而不走网络。
      injectSnapshotAssets(snap.projectJson, vm);
      // 2) 剥离 assets 字段（仅传输用，不属于 sb3 结构，避免 parser 处理未知字段）
      const projectData = Object.assign({}, snap.projectJson);
      delete projectData.assets;
      vm.loadProject(projectData).then(() => {
        // 标题不在 sb3 结构内，应用快照后从 payload 恢复（字段缺失时跳过）
        const title = snap.projectJson && snap.projectJson.projectTitle;
        if (typeof title === 'string' && title) {
          try {
            addon.tab.redux.dispatch({ type: 'projectTitle/SET_PROJECT_TITLE', title });
          } catch (e) { /* ignore */ }
        }
        // 防回声加固：校验应用后本地内容与快照结构一致性（targets/costumes/sounds 数量）。
        // 若不一致（如 loadProject 因 asset 缺失失败导致角色消失、内容异常缩水），
        // 则不更新防循环基准，并进入异常抑制期完全禁止推送/补推，防止传播残废快照。
        let applyOk = true;
        const stats = { targets: '-/-', costumes: '-/-', sounds: '-/-' };
        try {
          const snapTargets = (projectData && projectData.targets) || [];
          const curTargets = (vm.runtime && vm.runtime.targets) || [];
          const cnt = (arr) => (Array.isArray(arr) ? arr.length : 0);
          const snapCostumes = snapTargets.reduce((n, t) => n + cnt(t && t.costumes), 0);
          const snapSounds = snapTargets.reduce((n, t) => n + cnt(t && t.sounds), 0);
          const curCostumes = curTargets.reduce((n, t) => n + cnt(typeof t.getCostumes === 'function' ? t.getCostumes() : (t && t.costumes)), 0);
          const curSounds = curTargets.reduce((n, t) => n + cnt(typeof t.getSounds === 'function' ? t.getSounds() : (t && t.sounds)), 0);
          stats.targets = `${snapTargets.length}/${curTargets.length}`;
          stats.costumes = `${snapCostumes}/${curCostumes}`;
          stats.sounds = `${snapSounds}/${curSounds}`;
          if (snapTargets.length !== curTargets.length || snapCostumes !== curCostumes || snapSounds !== curSounds) {
            applyOk = false;
          }
        } catch (e) { /* 校验失败不阻塞，保守按应用成功处理 */ }
        if (applyOk) {
          // 回声防护：应用成功后把防循环基准更新为应用后内容（标题先 dispatch，
          // redux state 同步更新后再读取），补推机制的内容对比即可拦截回声。
          try {
            const t = addon.tab.redux.state && addon.tab.redux.state.scratchGui
              ? addon.tab.redux.state.scratchGui.projectTitle : '';
            lastPushedTitle = typeof t === 'string' ? t : '';
          } catch (e) { /* ignore */ }
          try {
            lastPushedRaw = vm.toJSON();
          } catch (e) { /* ignore */ }
          // 快照应用成功后重建监视器基线，并向房间广播本端监视器全量，
          // 让加入时处于不同监视器状态的端立即对齐（变量监视器 / 列表监视器）。
          buildMonitorBaseline();
          broadcastMonitorsFull();
          // 快照不携带监视器，loadProject 后本端监视器被清空；向快照来源端
          // 定向请求其监视器全量，由对方回发 monitor-sync 完成对齐。
          if (currentClient && snap.fromClientId) {
            try {
              currentClient.sendRelay(protocol.KIND_OP, { type: 'monitor-request' }, snap.fromClientId);
            } catch (e) { /* ignore */ }
          }
          // 中心定序对齐 + 差值 op 补偿：快照为权威全量，将 lastSeq 对齐到快照携带的
          // 中心序号（发送方推送快照时已应用到的序号），再向服务端请求拉取快照之后的
          // 差值 op，彻底规避"快照与实时 op 入房/重连瞬间竞态"（此前由 reset() 部分规避）。
          cancelPendingCatchup();
          const snapSeq = (snap.projectJson && typeof snap.projectJson.opSeq === 'number')
            ? snap.projectJson.opSeq : 0;
          if (lastSeq === null || snapSeq > lastSeq) lastSeq = snapSeq;
          // 快照应用完成：退出应用期缓冲，按中心序号升序串行落地缓冲中的实时 op
          //（applyRemoteOpWithSeq 按 lastSeq 去重，只应用快照之后的差值 op）
          snapshotApplying = false;
          const buffered = bufferedOps.slice();
          bufferedOps = [];
          if (buffered.length) {
            buffered.sort((a, b) => (a.seq || 0) - (b.seq || 0));
            for (const op of buffered) {
              applyRemoteOpWithSeq(op.type, op.payload, { from: op.from }, op.seq);
            }
          }
          requestCatchup();
          setActivity(`${fmtTime(Date.now())} 已自动应用 ${snap.displayName} 的快照`);
        } else {
          // 内容异常缩水：不更新防循环基准；清掉补推意图并进入异常抑制期，
          // 期间 maybePush 直接丢弃一切推送/补推，防止残废快照传播。
          console.warn('[remote-coop] 快照应用后内容与快照结构不一致（加载失败？），进入异常抑制期', stats);
          pendingPush = false;
          suppressPushUntil = Math.max(suppressPushUntil, Date.now() + SUPPRESS_WINDOW_MS);
          corruptedSuppressUntil = Date.now() + CORRUPTED_SUPPRESS_MS;
          setActivity(`${fmtTime(Date.now())} 应用 ${snap.displayName} 的快照后内容异常（${stats.targets}），已暂停推送`);
        }
      }).catch((e) => {
        // 应用失败同样进入异常抑制期，防止因内容变化补推残废快照
        console.warn('[remote-coop] 自动应用快照失败，进入异常抑制期', e);
        pendingPush = false;
        suppressPushUntil = Math.max(suppressPushUntil, Date.now() + SUPPRESS_WINDOW_MS);
        corruptedSuppressUntil = Date.now() + CORRUPTED_SUPPRESS_MS;
        setActivity(`自动应用快照失败：${e.message}，已暂停推送`);
      }).finally(() => {
        // 异常/未知路径兜底：若成功分支未消费缓冲（应用失败或内容校验失败），
        // 退出快照应用期并丢弃缓冲，防止后续 op 永远卡在缓冲中
        if (snapshotApplying) {
          snapshotApplying = false;
          bufferedOps = [];
        }
        // loadProject 内部异步完成后可能仍会触发 PROJECT_CHANGED / targetsUpdate，
        // 结束时再延长一次抑制窗口兜底
        exitRemoteApply();
        suppressPushUntil = Math.max(suppressPushUntil, Date.now() + SUPPRESS_WINDOW_MS);
      });
    } catch (e) {
      // 外层兜底：同步阶段抛错也退出快照应用期并丢弃缓冲
      snapshotApplying = false;
      bufferedOps = [];
      exitRemoteApply();
      setActivity(`自动应用快照失败：${e.message}`);
    }
  }

  // -------------------------------------------------------------------------
  // 监视器同步（变量监视器 / 列表监视器）
  // -------------------------------------------------------------------------
  // 监视器由 runtime._monitorState 维护（MonitorRecord 列表），不挂在任何 target 的
  // blocks 上，快照同步（sb3 JSON）不会携带它。op 引擎已实现 MONITOR_ADD/UPDATE/DELETE
  // 增量同步；此处补齐全量对齐：
  //   1) 加入房间 / 快照应用成功后，向房间广播本端监视器全量（monitor-sync），
  //      让端侧监视器状态立即对齐（增量 op 只同步变化，不覆盖初始差异）；
  //   2) 收到 monitor-sync 时整体应用（走 runtime 标准入口，与本地渲染链路一致）。
  // 全量广播由加入时刻触发的快照应用驱动：收到对端 init-state 并 loadProject 成功后，
  // 本端项目结构已与对端一致，此时广播本端监视器全量，对端应用后两侧监视器完全对齐。
  const collectMonitorState = () => {
    const vm = getVm();
    const runtime = vm && vm.runtime;
    if (!runtime || typeof runtime.getMonitorState !== 'function') return [];
    try {
      const st = runtime.getMonitorState();
      if (!st || typeof st.values !== 'function') return [];
      return st.values().map((rec) => ({
        id: rec.id,
        spriteName: rec.spriteName,
        opcode: rec.opcode,
        value: rec.value,
        params: rec.params,
        mode: rec.mode,
        sliderMin: rec.sliderMin,
        sliderMax: rec.sliderMax,
        isDiscrete: rec.isDiscrete,
        x: rec.x,
        y: rec.y,
        width: rec.width,
        height: rec.height,
        visible: rec.visible,
      }));
    } catch (e) {
      console.warn('[remote-coop] 监视器全量收集失败', e);
      return [];
    }
  };

  // 快照 loadProject 成功后重建监视器基线（供 op 引擎 MONITOR_UPDATE 按 key 对齐字段）
  const buildMonitorBaseline = () => {
    try {
      if (!opEngine || typeof opEngine.setMonitorBaseline !== 'function') return;
      const list = collectMonitorState();
      const map = new Map();
      for (const m of list) {
        if (!m || !m.id) continue;
        const paramsKey = (m.params && (m.params.VARIABLE || m.params.LIST)) || '';
        map.set(`${m.id}|${m.spriteName || ''}|${m.opcode || ''}|${paramsKey}`, m);
      }
      opEngine.setMonitorBaseline(map);
    } catch (e) {
      console.warn('[remote-coop] 监视器基线构建失败', e);
    }
  };

  const broadcastMonitorsFull = () => {
    if (!state.collabOn || !currentClient) return;
    try {
      currentClient.sendRelay(protocol.KIND_OP, { type: 'monitor-sync', payload: { monitors: collectMonitorState() } });
    } catch (e) {
      console.warn('[remote-coop] 监视器全量同步发送失败', e);
    }
  };

  // 应用远端监视器全量：整体对齐本端监视器状态（存在则更新，不存在则新建，不删除本端独有项）
  const applyMonitorFullSync = (payload) => {
    const vm = getVm();
    const runtime = vm && vm.runtime;
    if (!runtime) return;
    const list = (payload && Array.isArray(payload.monitors)) ? payload.monitors : [];
    if (!list.length) return;
    enterRemoteApply();
    suppressPushUntil = Math.max(suppressPushUntil, Date.now() + SUPPRESS_WINDOW_MS);
    try {
      for (const m of list) {
        if (!m || !m.id) continue;
        if (typeof runtime.requestAddMonitor !== 'function') break;
        runtime.requestAddMonitor({
          id: m.id,
          spriteName: m.spriteName,
          opcode: m.opcode,
          value: m.value,
          params: m.params,
          mode: m.mode,
          sliderMin: m.sliderMin,
          sliderMax: m.sliderMax,
          isDiscrete: m.isDiscrete,
          x: m.x,
          y: m.y,
          width: m.width,
          height: m.height,
          visible: m.visible,
        });
      }
    } catch (e) {
      console.warn('[remote-coop] 监视器全量同步应用失败', e);
    }
    exitRemoteApply();
    suppressPushUntil = Math.max(suppressPushUntil, Date.now() + SUPPRESS_WINDOW_MS);
    // 应用后重建基线，防止后续增量 op 与远端字段错位
    buildMonitorBaseline();
  };

  function renderRemoteSnaps() {
    cardRemoteSnaps.style.display = state.remoteSnapshots.length ? '' : 'none';
    rsList.innerHTML = '';
    for (const snap of state.remoteSnapshots) {
      const row = el('div', 'rc-remote-snap');
      const info = el('div', 'rc-remote-snap-info',
        `来自 ${snap.displayName}${snap.fromClientId === clientId ? '（我）' : ''} · 快照于 ${fmtTime(snap.at)} · 已自动应用`);
      const applyBtn = el('button', 'rc-btn rc-btn-secondary rc-btn-sm', '重新应用');
      applyBtn.addEventListener('click', () => {
        applyRemoteSnapshot(snap);
      });
      row.append(info, applyBtn);
      rsList.appendChild(row);
    }
  }

  // -------------------------------------------------------------------------
  // asset 同步：快照结构（sb3 JSON）之外，把项目引用的 costumes/sounds
  // 二进制随快照一并发送；接收端应用前先注入本地 storage 缓存，避免
  // 远端因本地无 asset 而去 assets.scratch.mit.edu 拉取（超时/加载失败）。

  // -------------------------------------------------------------------------
  // VM 项目快照同步（PROJECT_CHANGED / targetsUpdate / 标题 / 扩展变化
  //   -> Y.Map('root').project:<clientId>）
  // -------------------------------------------------------------------------
  // 防循环常量：自动应用远端快照后的推送抑制窗口。
  // 需覆盖 loadProject 异步完成 + GUI 渲染产生的 echo 事件链，
  // 3s > 现有 150ms 推送延时 + 400ms 节流，留足余量。
  const SUPPRESS_WINDOW_MS = 3000;
  // 快照应用后内容异常缩水（角色/声音丢失等）时的推送完全禁止期：
  // 期间任何推送/补推意图都被丢弃，防止把残废快照传播给其他端。
  const CORRUPTED_SUPPRESS_MS = 30000;

  let lastPushAt = 0;
  let pushTimer = null;
  // ---- 防循环状态 ----
  // applyingRemote 语义为“正在应用远端数据（快照 loadProject / op 串行落地 / 监视器全量）”。
  // 单条 op 应用是同步包一层异步（applyRemoteOp().finally），多条并发应用时若直接置 false，
  // 会把“仍在应用中的另一条”误判为结束，导致捕获层提前解除抑制产生回声。计数化解决：
  // 进入 +1、结束 -1，为 0 才算全部应用完（同时保持布尔值供现有判断使用）。
  let applyingRemote = false;      // 正在自动应用远端快照（loadProject 进行中）
  let remoteApplyDepth = 0;        // 远端应用深度计数（见上）
  const enterRemoteApply = () => {
    remoteApplyDepth += 1;
    applyingRemote = true;
  };
  const exitRemoteApply = () => {
    remoteApplyDepth = Math.max(0, remoteApplyDepth - 1);
    if (remoteApplyDepth === 0) applyingRemote = false;
  };
  let suppressPushUntil = 0;       // 抑制窗口截止时间戳（应用远端快照后短时间内不推）
  let pendingPush = false;         // 抑制窗口内发生本地改动，窗口结束后补推一次
  let suppressTimer = null;        // 补推定时器
  let corruptedSuppressUntil = 0;  // 内容异常抑制期截止时间戳（期间完全禁止推送/补推）
  // 推送端前后内容对比兜底：上次推送的 vm 内容原始串 + 标题，
  // 两者均无变化则不推，从根上杜绝 PROJECT_CHANGED echo 造成的内容循环。
  let lastPushedRaw = null;
  let lastPushedTitle = '';

  // ---- op 缓冲、中心定序与断线重连补偿（catchup） ----
  // 中心定序：信令服务为每条广播 KIND_OP 打全局单调中心序号（seq）并写入房间 op 历史。
  //   - 本端维护 lastSeq（已应用到的最高中心序号）：seq <= lastSeq 的 op 一律去重跳过，
  //     应用完成（含 no-op / 失败）后推进 lastSeq；
  //   - 自己发出的 op 收到服务端 echo（含中心 seq）时只推进 lastSeq 不应用（本地已落地）；
  //   - 断线重连 / 快照应用成功后，向服务端请求 KIND_OP_CATCHUP(since=lastSeq)，
  //     服务端从 op 历史定向回传 seq > since 的条目，本端按 seq 升序补齐（断线重连补偿）。
  // 缓冲窗口（enterCatchup）：加入/重连瞬间对端可能同时下发 init-state（全量快照）与若干
  // 增量 op，若增量先于快照落地会落在旧项目结构上造成错乱。策略：welcome 后进入短暂缓冲
  // 窗口，窗口内收到的 op 先缓存；init-state 到达时 doApplySnapshot 会清空缓冲（快照权威
  // 全量，其携带的 opSeq 将 lastSeq 对齐到快照时点，之后 catchup 只补差值）。
  const CATCHUP_MS = 800;       // 缓冲窗口：等待 init-state 到达
  const MAX_BUFFERED_OPS = 500; // 缓冲上限：超出丢弃最旧，防内存膨胀
  const CATCHUP_REQUEST_TIMEOUT_MS = 5000; // catchup 请求超时兜底：只应用缓冲，丢弃历史
  let catchup = null;           // { until, timer }
  let bufferedOps = [];
  // 本端 op 序号（随 sendOp 自增，仅诊断用；收敛以服务端中心 seq 为准）
  let localOpSeq = 0;
  // 本端已见最高中心序号（诊断用）
  let opSeqWatermark = 0;
  // 本端已应用到的最高中心序号；null 表示尚未初始化（首次 welcome 时用房间当前序号对齐）
  let lastSeq = null;
  // 快照应用期标志：doApplySnapshot 进入（loadProject 异步窗口）到应用完成之间为 true，
  // 期间到达的实时 op 先缓冲（快照为权威全量，避免增量落在旧项目结构上错乱），
  // 应用完成、lastSeq 对齐到快照 opSeq 后按中心序号升序落地差值 op。
  let snapshotApplying = false;
  // 历史补偿在途状态：{ since, buffer, timer }；非 null 表示 catchup 请求在途
  let pendingCatchup = null;

  // ---- 断线自动重连（保留 lastSeq，重连成功后 catchup 补偿断线期间差值 op） ----
  const RECONNECT_MAX_ATTEMPTS = 5;
  const RECONNECT_DELAY_MS = 3000;
  let reconnectTimer = null;
  let reconnectAttempts = 0;
  const scheduleReconnect = () => {
    if (!state.collabOn || !state.roomId || currentClient) return;
    reconnectAttempts += 1;
    if (reconnectAttempts > RECONNECT_MAX_ATTEMPTS) {
      state.collabOn = false;
      toggleCheck.checked = false;
      setStatus('idle', '连接已断开（自动重连失败）');
      setActivity('');
      return;
    }
    setStatus('connecting', `连接断开，正在自动重连（${reconnectAttempts}/${RECONNECT_MAX_ATTEMPTS}）…`);
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      startJoin(state.roomId);
    }, RECONNECT_DELAY_MS);
  };

  const opBufferActive = () => state.collabOn && catchup !== null && Date.now() < catchup.until;
  const cancelCatchup = () => {
    if (catchup) {
      if (catchup.timer) clearTimeout(catchup.timer);
      catchup = null;
    }
    bufferedOps = [];
  };
  const enterCatchup = () => {
    cancelCatchup();
    catchup = { until: Date.now() + CATCHUP_MS, timer: null };
    catchup.timer = setTimeout(() => {
      finishCatchup();
    }, CATCHUP_MS);
  };

  // 单条远端 op 应用封装：串行落地 + 推送抑制 + 应用后推进 lastSeq（含 no-op/失败），
  // 已按中心序号去重（seq <= lastSeq 直接跳过）。
  const applyRemoteOpWithSeq = (type, payload, meta, seq) => {
    if (!opEngine) return;
    if (typeof seq === 'number' && lastSeq !== null && seq <= lastSeq) return;
    enterRemoteApply();
    suppressPushUntil = Math.max(suppressPushUntil, Date.now() + SUPPRESS_WINDOW_MS);
    opEngine.applyRemoteOp(type, payload, meta).finally(() => {
      exitRemoteApply();
      suppressPushUntil = Math.max(suppressPushUntil, Date.now() + SUPPRESS_WINDOW_MS);
      if (typeof seq === 'number' && (lastSeq === null || seq > lastSeq)) lastSeq = seq;
      if (typeof seq === 'number' && seq > opSeqWatermark) opSeqWatermark = seq;
    });
  };

  // 缓冲窗口结束：按中心序号升序串行落地（无快照兜底时的增量补放），随后请求历史补偿
  const finishCatchup = () => {
    if (!catchup) return;
    catchup = null;
    const buffered = bufferedOps.slice();
    bufferedOps = [];
    if (buffered.length) {
      buffered.sort((a, b) => (a.seq || 0) - (b.seq || 0));
      for (const op of buffered) {
        applyRemoteOpWithSeq(op.type, op.payload, { from: op.from }, op.seq);
      }
    }
    // 窗口结束仍无快照：主动拉历史补偿，防止入房/重连瞬间到快照到达前的 op 丢失
    requestCatchup();
  };

  // ---- 历史 op 补偿（中心定序 catchup 状态机） ----
  // 触发：断线重连成功、缓冲窗口结束仍无快照、快照应用成功后（补快照之后差值 op）。
  // 在途期间到达的实时 op 先入 pendingCatchup.buffer，收到回传结果后按 seq 升序合并应用；
  // 超时未回（网络异常/历史被裁剪）则丢弃历史、只应用缓冲中实时 op。
  const cancelPendingCatchup = () => {
    if (pendingCatchup) {
      if (pendingCatchup.timer) clearTimeout(pendingCatchup.timer);
      pendingCatchup = null;
    }
  };
  const requestCatchup = () => {
    if (!state.collabOn || !currentClient || !opEngine) return;
    const since = (typeof lastSeq === 'number' && lastSeq !== null) ? lastSeq : 0;
    cancelPendingCatchup();
    pendingCatchup = {
      since,
      buffer: [],
      timer: setTimeout(() => {
        if (!pendingCatchup) return;
        const pc = pendingCatchup;
        pendingCatchup = null;
        const buffered = pc.buffer.slice();
        pc.buffer = [];
        buffered.sort((a, b) => (a.seq || 0) - (b.seq || 0));
        for (const op of buffered) {
          applyRemoteOpWithSeq(op.type, op.payload, { from: op.from }, op.seq);
        }
      }, CATCHUP_REQUEST_TIMEOUT_MS),
    };
    currentClient.sendRelay(protocol.KIND_OP_CATCHUP, { since });
  };
  // 应用 catchup 回传历史：升序合并历史 + 在途缓冲实时 op，去重后依次落地
  const applyCatchupResult = (ops) => {
    if (!pendingCatchup || !opEngine) return;
    const pc = pendingCatchup;
    pendingCatchup = null;
    if (pc.timer) clearTimeout(pc.timer);
    const merged = (Array.isArray(ops) ? ops : []).concat(pc.buffer);
    pc.buffer = [];
    merged.sort((a, b) => (a.seq || 0) - (b.seq || 0));
    for (const op of merged) {
      if (!op || !op.type) continue;
      applyRemoteOpWithSeq(op.type, op.payload, { from: op.from }, op.seq);
    }
  };

  const maybePushProjectSnapshot = () => {
    const vm = getVm();
    if (!state.collabOn || !currentClient || !state.snapSyncOn || !vm) return;
    const now = Date.now();
    // 内容异常抑制期：快照应用后本地内容异常缩水（见 applyRemoteSnapshot 结构校验）
    // 时完全禁止推送/补推，连 pendingPush 都不记，防止传播残废快照。
    if (now < corruptedSuppressUntil) {
      pendingPush = false;
      return;
    }
    // 防循环（第一道）：自动应用远端快照期间 / 抑制窗口内不推。
    // 但若期间确有本地改动，记 pendingPush，窗口结束后补推一次，
    // 由第二道（内容对比）决定是否真的推送，避免改动丢失。
    if (applyingRemote || now < suppressPushUntil) {
      pendingPush = true;
      if (!suppressTimer) {
        suppressTimer = setTimeout(() => {
          suppressTimer = null;
          if (pendingPush) {
            pendingPush = false;
            maybePushProjectSnapshot();
          }
        }, Math.max(0, suppressPushUntil - now) + 200);
      }
      return;
    }
    if (now - lastPushAt < 400) return; // 简单节流（提速：2000ms -> 400ms）
    lastPushAt = now;
    if (pushTimer) clearTimeout(pushTimer);
    pushTimer = setTimeout(() => {
      const vm = getVm();
      if (!state.collabOn || !currentClient || !state.snapSyncOn || !vm) return;
      try {
        // scratch-vm 的 toJSON() 返回 JSON 字符串，需 parse 成对象后才能赋 updatedAt
        const rawNow = vm.toJSON();
        const projectJson = JSON.parse(rawNow);
        // 作品标题存于 GUI redux（state.scratchGui.projectTitle），不在 sb3 结构内，额外携带
        let titleNow = '';
        try {
          const title = addon.tab.redux.state && addon.tab.redux.state.scratchGui
            ? addon.tab.redux.state.scratchGui.projectTitle
            : '';
          if (typeof title === 'string' && title) titleNow = title;
        } catch (e) { /* 标题字段缺失时保持原有行为，不影响快照推送 */ }
        // 防循环（第二道）：前后内容对比兜底——vm 内容与标题均无实质变化则不推，
        // 可拦截任何绕过抑制窗口的 echo（如 targetsUpdate / 标题 statechanged 补推）。
        if (rawNow === lastPushedRaw && titleNow === lastPushedTitle) {
          return;
        }
        lastPushedRaw = rawNow;
        lastPushedTitle = titleNow;
        projectJson.updatedAt = Date.now();
        // 携带发送方当前已应用到的中心序号（lastSeq）：接收端应用快照后据此对齐
        // lastSeq，只补快照之后的差值 op（中心定序 catchup 的关键定界，解决
        // 快照与实时 op 入房/重连瞬间竞态）。
        if (typeof lastSeq === 'number' && lastSeq !== null) {
          projectJson.opSeq = lastSeq;
        }
        if (titleNow) projectJson.projectTitle = titleNow;
        // 携带 asset 引用清单（assetId + dataFormat），不再携带二进制本体；
        // 接收端本地缺失时按需拉取（asset-request / asset-data），
        // 避免大项目图片声音把快照消息撑到 MB 级拖慢同步。
        try {
          projectJson.assets = collectAssetManifest(vm);
        } catch (e) {
          console.warn('[remote-coop] asset 清单收集失败', e);
          projectJson.assets = [];
        }
        currentClient.setKey(`project:${clientId}`, projectJson);
      } catch (e) {
        console.warn('[remote-coop] 项目快照推送失败', e);
      }
    }, 150);
  };

  let projectChangedRegistered = false;
  let targetsUpdateRegistered = false;
  let titleListenerRegistered = false;
  let vmWaitRetries = 0;
  let extWatchTimer = null;
  let lastExtKeys = '';
  const ensureProjectChangedRegistered = () => {
    // 只在异步初始化链路中注册一次；注册时 GUI 已渲染、SET_VM 已注入，getVm() 能取到真实 vm
    if (projectChangedRegistered && targetsUpdateRegistered && titleListenerRegistered) return;
    const vm = getVm();
    if (!vm) {
      // React commit 阶段 DOM 插入先于 vm-manager-hoc componentDidMount（SET_VM 注入），
      // 容器出现瞬间 getVm() 可能仍为 null，延迟重试直到注入（最多 30s，避免无限空转）
      if (vmWaitRetries < 60) {
        vmWaitRetries += 1;
        setTimeout(ensureProjectChangedRegistered, 500);
      } else {
        console.warn('[remote-coop] 多次重试仍未获取到 vm，项目变更监听未注册');
      }
      return;
    }
    if (!projectChangedRegistered) {
      vm.on('PROJECT_CHANGED', maybePushProjectSnapshot);
      projectChangedRegistered = true;
    }
    if (!targetsUpdateRegistered) {
      // 补充触发：scratch-vm 中角色重命名/删除、造型重命名/绘制、声音增删改、
      // 角色排序等操作只 emit targetsUpdate、不触发 PROJECT_CHANGED，
      // 通过监听 targetsUpdate 兜底触发推送（高频非结构变化由节流 + 内容对比过滤）。
      vm.on('targetsUpdate', maybePushProjectSnapshot);
      targetsUpdateRegistered = true;
    }
    if (!titleListenerRegistered) {
      // 标题变化：监听 redux projectTitle/SET_PROJECT_TITLE，复用现有节流与防循环
      try {
        addon.tab.redux.addEventListener('statechanged', (e) => {
          const action = e && e.detail && e.detail.action;
          if (action && action.type === 'projectTitle/SET_PROJECT_TITLE') {
            maybePushProjectSnapshot();
          }
        });
        titleListenerRegistered = true;
      } catch (err) {
        console.warn('[remote-coop] 标题变化监听注册失败', err);
      }
    }
    // 扩展变化：extensionManager 加载扩展不触发任何事件，collabOn 时轻量轮询
    // 对比已加载扩展集合，发生变化即触发推送（仅记录不推送一次基准，避免误触发）
    if (!extWatchTimer) {
      extWatchTimer = setInterval(() => {
        if (!state.collabOn || !currentClient) return;
        try {
          const vmNow = getVm();
          const em = vmNow && vmNow.extensionManager;
          const keys = em ? Array.from(em._loadedExtensions.keys()).sort().join(',') : '';
          if (lastExtKeys !== '' && keys !== lastExtKeys) {
            maybePushProjectSnapshot();
          }
          lastExtKeys = keys;
        } catch (e) { /* ignore */ }
      }, 1500);
    }
    console.log('[remote-coop] 项目变更监听已注册（PROJECT_CHANGED + targetsUpdate + 标题 + 扩展）');
  };

  // -------------------------------------------------------------------------
  // 事件绑定
  // -------------------------------------------------------------------------
  createBtn.addEventListener('click', () => {
    if (state.collabOn) {
      setActivity('已处于协作中，请先离开当前房间');
      return;
    }
    startJoin(genRoomId());
  });

  joinBtn.addEventListener('click', () => {
    const roomId = joinInput.value.trim().toUpperCase();
    if (!roomId) {
      setActivity('请输入房间号');
      return;
    }
    startJoin(roomId);
  });

  joinInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') joinBtn.click();
  });

  leaveBtn.addEventListener('click', () => {
    stopCollab(false);
    syncDetail.textContent = '已离开房间';
    setActivity('');
  });

  toggleCheck.addEventListener('change', () => {
    if (toggleCheck.checked) {
      if (!state.roomId && !state.collabOn) {
        setActivity('请先创建或加入房间');
        toggleCheck.checked = false;
        return;
      }
      if (state.roomId && !currentClient) {
        startJoin(state.roomId);
      }
    } else {
      stopCollab(false);
    }
  });

  snapCheck.addEventListener('change', () => {
    state.snapSyncOn = snapCheck.checked;
    setActivity(snapCheck.checked ? '项目快照同步已开启' : '项目快照同步已关闭');
  });

  closeBtn.addEventListener('click', () => {
    try {
      addon.tab.redux.dispatch({ type: 'scratch-gui/navigation/ACTIVATE_TAB', activeTabIndex: 0 });
    } catch (e) { /* ignore */ }
  });

  nameInput.addEventListener('change', () => {
    localStorage.setItem('sky-remote-coop-name', nameInput.value.trim());
  });

  // -------------------------------------------------------------------------
  // 挂载：等 gui.jsx 的空面板容器出现后注入
  // -------------------------------------------------------------------------
  const mount = async () => {
    const container = await waitFor("[class*='skyRemoteCoopPanel']");
    container.appendChild(root);
    // 容器出现 = GUI 已渲染、SET_VM 已注入，此时 getVm() 能取到真实 vm，注册 PROJECT_CHANGED
    ensureProjectChangedRegistered();
  };
  await mount();

  // -------------------------------------------------------------------------
  // Bilup 兼容模式（bilup-compat.js）：在方案A 面板的同一 root 下挂载独立小面板。
  // 与方案A 互斥：onStateChange 维护 bilupActive，op-engine 的 sendOp /
  // sendAssetRequest 据此路由到 Bilup propose/asset 通道；getEngine 惰性确保
  // Bilup 会话启动时 op-engine 已创建（复用捕获/应用能力）；deactivateSchemeA
  // 在进入 Bilup 模式前停掉方案A 连接（opEngine 由 Bilup 会话复用，不销毁）。
  // -------------------------------------------------------------------------
  try {
    bilupCompat = createBilupCompat({
      vm: getVm(),
      getVm,
      el,
      mountEl: root,
      log: (...args) => console.warn('[bilup-compat]', ...args),
      onStateChange: (m) => {
        bilupActive = (m === 'bilup-client' || m === 'bilup-host');
      },
      getEngine: () => {
        if (!opEngine) ensureOpEngine();
        return opEngine;
      },
      deactivateSchemeA: () => {
        if (state.collabOn && currentClient) stopCollab(true);
      },
    });
  } catch (e) {
    console.warn('[remote-coop] Bilup 兼容层初始化失败', e);
  }

  // 回到编辑页时容器可能重挂载，循环等待
  while (true) {
    await waitFor("[class*='skyRemoteCoopPanel']");
    if (!root.isConnected) {
      containerAppend();
    }
  }

  function containerAppend() {
    // 重新注入（root 已被 React 重渲染移除时）
    document.querySelector("[class*='skyRemoteCoopPanel']")?.appendChild(root);
  }

  // addon 被禁用：断开协作并回到积木页
  addon.self.addEventListener('disabled', () => {
    stopCollab(true);
    // Bilup 兼容模式：断开 PeerJS 会话与面板，恢复模式状态
    if (bilupCompat) {
      try {
        bilupCompat.destroy();
      } catch (e) { /* ignore */ }
      bilupCompat = null;
    }
    bilupActive = false;
    // 销毁操作级同步引擎（stopCollab 已处理，这里兜底一次）
    destroyOpEngine();
    const vm = getVm();
    if (vm) {
      try {
        vm.removeListener('PROJECT_CHANGED', maybePushProjectSnapshot);
      } catch (e) { /* ignore */ }
      try {
        vm.removeListener('targetsUpdate', maybePushProjectSnapshot);
      } catch (e) { /* ignore */ }
    }
    if (extWatchTimer) {
      clearInterval(extWatchTimer);
      extWatchTimer = null;
    }
    if (suppressTimer) {
      clearTimeout(suppressTimer);
      suppressTimer = null;
    }
    if (assetWait) {
      if (assetWait.timer) clearTimeout(assetWait.timer);
      assetWait = null;
    }
    try {
      const cur = addon.tab.redux.state.scratchGui.editorTab.activeTabIndex;
      // 横向下远程协作为 3，竖向下为 4；统一用 DOM 判断是否在远程协作面板
      const panelVisible = root.isConnected && document.body.contains(root);
      if (panelVisible) {
        addon.tab.redux.dispatch({ type: 'scratch-gui/navigation/ACTIVATE_TAB', activeTabIndex: 0 });
      }
      void cur;
    } catch (e) { /* ignore */ }
  });
}

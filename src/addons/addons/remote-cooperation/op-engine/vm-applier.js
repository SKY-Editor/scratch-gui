/**
 * vm-applier.js —— 自 op-engine.js 拆出（2026-11-18 刀8）。
 */
import {createStorageAsset, OP, OpApplier} from './core.js';
import {cloneJson} from './vm-methods.js';
import {serializeEvent, reconstructEvent, shouldSyncEvent} from '../block-serialization.js';


// ---------------------------------------------------------------------------
// VMApplier —— 应用层：把远端 op 串行应用到真实 VM（+ 正在编辑目标的 Blockly）
// ---------------------------------------------------------------------------
const PROCEDURE_WINDOW_DURATION_MS = 5000;
const CREATING_BLOCK_TTL_MS = 1000;

class VMApplier extends OpApplier {
  /**
   * @param {object} options
   * @param {VirtualMachine} options.vm scratch-vm 实例
   * @param {Function} options.getWorkspace () => Blockly workspace | null
   * @param {Function} options.requestAssets (refs, fromClientId) => Promise
   *   应用需要 asset 的 op 前确保本地 asset 就绪（缺失时定向拉取并等待注入）
   */
  constructor({ vm, getWorkspace, requestAssets }) {
    super();
    this.vm = vm;
    this.getWorkspace = getWorkspace;
    this.requestAssets = requestAssets || (() => Promise.resolve());

    this._recentlyCreatedProcedureBlocks = new Map();
    this._currentlyCreatingBlocks = new Set();
    this._procedureWindowStart = 0;
    this._timers = new Set();

    // 监视器同步基线：由外部（userscript 快照应用后）回填，用于按 key 应用远端 op
    this.syncMonitorBaseline = null; // Map<monitorKey, monitor json> | null

    // 应用串行队列：异步 op（addSprite/addCostume 等）严格按到达顺序落地
    this._chain = Promise.resolve();
  }

  apply(type, payload, meta = {}) {
    this._chain = this._chain.then(async () => {
      this._remoteApplyDepth++;
      try {
        await this._apply(type, payload, meta);
      } catch (error) {
        console.warn(`[op-engine] 应用 op 失败 ${type}:`, error);
      } finally {
        this._remoteApplyDepth--;
      }
    });
    return this._chain;
  }

  /**
   * 重置应用队列（收到全量快照 loadProject 时调用，丢弃排队中的旧 op）。
   */
  reset() {
    this._chain = Promise.resolve();
    this._remoteApplyDepth = 0;
  }

  destroy() {
    this._timers.forEach((timer) => clearTimeout(timer));
    this._timers.clear();
    this._recentlyCreatedProcedureBlocks.clear();
    this._currentlyCreatingBlocks.clear();
    this._procedureWindowStart = 0;
  }

  _apply(type, payload, meta) {
    switch (type) {
      case OP.BLOCK_EVENT:
        return this._applyBlockEvent(payload);
      case OP.TARGET_UPDATE:
        return this._applyTargetUpdate(payload);
      case OP.MESSAGE_ADD:
      case OP.MESSAGE_RENAME:
      case OP.MESSAGE_DELETE:
        return this._applyMessageOp(type, payload);
      case OP.MONITOR_ADD:
      case OP.MONITOR_UPDATE:
      case OP.MONITOR_DELETE:
        return this._applyMonitorOp(type, payload);
      case OP.SPRITE_ADD:
      case OP.SPRITE_DELETE:
      case OP.SPRITE_RENAME:
      case OP.SPRITE_REORDER:
      case OP.COSTUME_ADD:
      case OP.COSTUME_DELETE:
      case OP.COSTUME_RENAME:
      case OP.COSTUME_SELECT:
      case OP.COSTUME_REORDER:
      case OP.COSTUME_DUPLICATE:
      case OP.COSTUME_UPDATE:
      case OP.SOUND_ADD:
      case OP.SOUND_DELETE:
      case OP.SOUND_RENAME:
      case OP.SOUND_REORDER:
      case OP.SOUND_DUPLICATE:
      case OP.SOUND_UPDATE:
      case OP.BLOCKS_SHARE:
      case OP.EXTENSION_LOAD:
      case OP.EXTENSION_REMOVE:
      case OP.EXTENSION_REORDER:
        return this._applyAssetOp(type, payload, meta);
      default:
        return undefined;
    }
  }

  _findTarget(payload) {
    const runtime = this.vm.runtime;
    if (payload.targetId) {
      const target = runtime.getTargetById(payload.targetId);
      if (target) return target;
    }
    const targetName = payload.targetName || (payload.event && payload.event.targetName);
    if (targetName) {
      return runtime.targets.find((t) => t.getName() === targetName) || null;
    }
    return null;
  }

  _applyBlockEvent(payload) {
    const target = this._findTarget(payload);
    if (!target) return; // 目标已删除：所有端一致地 no-op

    const workspace = this.getWorkspace();
    const event = reconstructEvent(workspace, payload.event);
    if (!event) return;
    event._syncOriginated = true;

    // 始终应用到该 target 的 VM 块表示
    try {
      if (target.blocks && target.blocks.blocklyListen) {
        target.blocks.blocklyListen(event);
      }
    } catch (e) { /* VM 侧失败不阻塞 */ }

    // 仅当用户正在编辑同一 target 时镜像到可见 workspace
    const isEditingTarget = target === this.vm.editingTarget;
    if (!isEditingTarget || !workspace) return;

    const ScratchBlocks = window.ScratchBlocks;
    if (!ScratchBlocks) return;
    try {
      switch (event.type) {
        case 'create':
          this._applyCreateUI(event, workspace, ScratchBlocks);
          break;
        case 'delete':
          this._applyDeleteUI(event, workspace, ScratchBlocks);
          break;
        case 'move':
          this._applyMoveUI(event, workspace, ScratchBlocks);
          break;
        case 'change':
          if (event.element === 'mutation') {
            this._applyMutationChangeUI(event, workspace, ScratchBlocks);
          } else {
            this._applyChangeUI(event, workspace, ScratchBlocks);
          }
          break;
        case 'comment_create':
          this._applyCommentCreateUI(event, workspace, ScratchBlocks);
          break;
        case 'comment_delete':
          this._applyCommentDeleteUI(event, workspace, ScratchBlocks);
          break;
        case 'comment_move':
          this._applyCommentMoveUI(event, workspace, ScratchBlocks);
          break;
        case 'comment_change':
          this._applyCommentChangeUI(event, workspace, ScratchBlocks);
          break;
        case 'var_create':
        case 'var_delete':
        case 'var_rename':
          this._applyVariableUI(event, workspace);
          break;
        default:
          break;
      }
    } catch (e) { /* UI 应用失败不打断 op 流；VM 状态已重建 */ }
  }

  _withEventsDisabled(ScratchBlocks, fn) {
    const wasEnabled = ScratchBlocks.Events.isEnabled();
    ScratchBlocks.Events.disable();
    try {
      fn();
    } finally {
      if (wasEnabled) ScratchBlocks.Events.enable();
    }
  }

  _applyCreateUI(event, workspace, ScratchBlocks) {
    if (!event.xml || !ScratchBlocks.Xml) return;
    let xml;
    if (typeof event.xml === 'string') {
      const parsed = ScratchBlocks.Xml.textToDom(`<xml>${event.xml}</xml>`);
      xml = parsed ? parsed.firstChild : null;
    } else {
      xml = event.xml;
    }
    if (!xml) return;
    // 重放防护：快照已包含该块则 no-op
    const declaredId = xml.getAttribute && xml.getAttribute('id');
    if (declaredId && workspace.getBlockById(declaredId)) return;

    this._withEventsDisabled(ScratchBlocks, () => {
      if (declaredId) this._currentlyCreatingBlocks.add(declaredId);
      const block = ScratchBlocks.Xml.domToBlock(xml, workspace);
      const createdBlockId = block ? block.id : declaredId;
      if (block) this._currentlyCreatingBlocks.add(block.id);

      const isProcedureBlock = block && (
        block.type === 'procedures_definition' ||
        block.type === 'procedures_prototype'
      );
      if (isProcedureBlock) {
        this._recentlyCreatedProcedureBlocks.set(block.id, Date.now());
        if (this._procedureWindowStart === 0) this._procedureWindowStart = Date.now();
        if (this.vm.emitWorkspaceUpdate) this.vm.emitWorkspaceUpdate();
        if (workspace.toolbox_ && workspace.toolbox_.refreshSelection) {
          workspace.toolbox_.refreshSelection();
        }
      }
      if (createdBlockId) {
        const timer = setTimeout(() => {
          this._currentlyCreatingBlocks.delete(createdBlockId);
          this._timers.delete(timer);
        }, CREATING_BLOCK_TTL_MS);
        this._timers.add(timer);
      }
    });
  }

  _applyDeleteUI(event, workspace, ScratchBlocks) {
    const blockId = event.blockId || event.id;
    const block = workspace.getBlockById(blockId);
    if (!block) return;
    const isProcedureBlock = block.type === 'procedures_definition' ||
      block.type === 'procedures_prototype';
    if (isProcedureBlock && this.isRecentlyCreatedProcedureBlock(blockId)) {
      // 过程编辑弹窗的 teardown 会删除远端刚创建的块，吞掉以镜像旧行为
      return;
    }
    this._withEventsDisabled(ScratchBlocks, () => {
      block.dispose(false, true);
    });
  }

  _applyMoveUI(event, workspace, ScratchBlocks) {
    const blockId = event.blockId || event.id;
    const block = workspace.getBlockById(blockId);
    if (!block) return;
    this._withEventsDisabled(ScratchBlocks, () => {
      if (block.getParent()) block.unplug(false);
      if (event.newCoordinate) {
        const currentPos = block.getRelativeToSurfaceXY();
        block.moveBy(event.newCoordinate.x - currentPos.x, event.newCoordinate.y - currentPos.y);
      } else if (event.newParentId) {
        const parentBlock = workspace.getBlockById(event.newParentId);
        if (!parentBlock) return;
        const blockConnection = block.outputConnection || block.previousConnection;
        let parentConnection = null;
        if (event.newInputName) {
          const input = parentBlock.getInput(event.newInputName);
          if (input) parentConnection = input.connection;
        } else if (blockConnection && parentBlock.nextConnection) {
          parentConnection = parentBlock.nextConnection;
        }
        if (parentConnection && blockConnection) parentConnection.connect(blockConnection);
      }
    });
  }

  _applyChangeUI(event, workspace, ScratchBlocks) {
    if (!event.blockId || !event.name || event.element !== 'field') return;
    const block = workspace.getBlockById(event.blockId);
    if (!block) return;
    const field = block.getField(event.name);
    if (!field || !('newValue' in event)) return;
    this._withEventsDisabled(ScratchBlocks, () => {
      field.setValue(event.newValue);
    });
  }

  _applyMutationChangeUI(event, workspace, ScratchBlocks) {
    if (!event.blockId || event.element !== 'mutation') return;
    const block = workspace.getBlockById(event.blockId);
    if (!block || typeof block.domToMutation !== 'function') return;
    if (typeof event.newValue === 'undefined') return;
    this._withEventsDisabled(ScratchBlocks, () => {
      const mutationXml = ScratchBlocks.Xml.textToDom(`<xml>${event.newValue}</xml>`);
      if (!mutationXml || !mutationXml.firstChild) return;
      block.domToMutation(mutationXml.firstChild);
      if (block.rendered && block.initSvg && !block.isInsertionMarker()) {
        block.initSvg();
        block.render();
      }
      if (this.vm.editingTarget && this.vm.editingTarget.blocks) {
        this.vm.editingTarget.blocks.populateProcedureCache();
      }
      if (workspace.toolbox_) workspace.toolbox_.refreshSelection();
    });
  }

  _applyCommentCreateUI(event, workspace, ScratchBlocks) {
    if (!ScratchBlocks.Xml) return;
    this._withEventsDisabled(ScratchBlocks, () => {
      if (event.xml) {
        let xmlText;
        if (typeof event.xml === 'string') {
          xmlText = event.xml;
        } else if (ScratchBlocks.Xml.domToText) {
          xmlText = ScratchBlocks.Xml.domToText(event.xml);
        } else if (event.xml.outerHTML) {
          xmlText = event.xml.outerHTML;
        }
        if (xmlText) {
          const xml = ScratchBlocks.Xml.textToDom(`<xml>${xmlText}</xml>`);
          ScratchBlocks.Xml.domToWorkspace(xml, workspace);
          return;
        }
      }
      if (event.blockId) {
        const block = workspace.getBlockById(event.blockId);
        if (block && block.setCommentText) {
          const x = event.xy ? event.xy.x : 0;
          const y = event.xy ? event.xy.y : 0;
          block.setCommentText(event.text || '', event.commentId, x, y, event.minimized || false);
          if (block.comment && event.width && event.height) {
            block.comment.setSize(event.width, event.height);
          }
        }
      } else if (ScratchBlocks.WorkspaceComment) {
        const comment = new ScratchBlocks.WorkspaceComment(
          workspace,
          event.text || '',
          event.height || 100,
          event.width || 200,
          event.minimized || false,
          event.commentId
        );
        if (event.xy) comment.moveTo(event.xy.x, event.xy.y);
      }
    });
  }

  _applyCommentDeleteUI(event, workspace, ScratchBlocks) {
    const comment = workspace.getCommentById(event.commentId);
    if (!comment) return;
    this._withEventsDisabled(ScratchBlocks, () => {
      comment.dispose(false, false);
    });
  }

  _applyCommentMoveUI(event, workspace, ScratchBlocks) {
    const comment = workspace.getCommentById(event.commentId);
    if (!comment) return;
    this._withEventsDisabled(ScratchBlocks, () => {
      if (event.newCoordinate_) {
        comment.moveTo(event.newCoordinate_.x, event.newCoordinate_.y);
      } else if (event.newCoordinate) {
        const coord = typeof event.newCoordinate === 'string' ?
          event.newCoordinate.split(',').map(parseFloat) :
          [event.newCoordinate.x, event.newCoordinate.y];
        comment.moveTo(coord[0], coord[1]);
      }
    });
  }

  _applyCommentChangeUI(event, workspace, ScratchBlocks) {
    const comment = workspace.getCommentById(event.commentId);
    if (!comment) return;
    this._withEventsDisabled(ScratchBlocks, () => {
      const newContents = event.newContents_ || event.newContents;
      if (!newContents) return;
      if (typeof newContents.minimized !== 'undefined' && comment.setMinimized) {
        comment.setMinimized(newContents.minimized);
      }
      if (newContents.width && newContents.height && comment.setSize) {
        comment.setSize(newContents.width, newContents.height);
      }
      if (newContents.text && comment.setText) comment.setText(newContents.text);
    });
  }

  _applyVariableUI(event, workspace) {
    if (!event.run || typeof event.run !== 'function') return;
    if (event.type === 'var_delete') {
      const variable = workspace.getVariableById(event.varId);
      if (!variable) return;
      const uses = workspace.variableMap_.getVariableUsesById(event.varId);
      if (uses && uses.length > 0) {
        workspace.deleteVariableInternal_(variable, uses);
      } else {
        workspace.variableMap_.deleteVariable(variable);
      }
    } else {
      event.run(true);
    }
  }

  _applyTargetUpdate(payload) {
    const target = this.vm.runtime.getTargetById(payload.targetId);
    if (!target) return;
    const props = payload.props;
    if (typeof props.x === 'number' || typeof props.y === 'number') {
      target.setXY(
        typeof props.x === 'number' ? props.x : target.x,
        typeof props.y === 'number' ? props.y : target.y
      );
    }
    if (typeof props.direction === 'number') target.setDirection(props.direction);
    if (typeof props.size === 'number') target.setSize(props.size);
    if (typeof props.visible === 'boolean') target.setVisible(props.visible);
    if (typeof props.rotationStyle === 'string') target.setRotationStyle(props.rotationStyle);
    if (typeof props.volume === 'number' && typeof target.setVolume === 'function') {
      target.setVolume(props.volume);
    }
    if (typeof props.videoTransparency === 'number' && typeof target.setVideoTransparency === 'function') {
      target.setVideoTransparency(props.videoTransparency);
    }
    this.vm.runtime.requestTargetsUpdate(target);
  }

  // 广播消息列表（runtime.messages）同步：镜像增删改，shouldUpdateProject=false
  // 避免应用期间触发 project changed 快照回环；块字段更新由 BLOCK_EVENT 链路负责。
  _applyMessageOp(type, payload) {
    const vm = this.vm;
    const runtime = vm.runtime;
    const name = payload && payload.name;
    switch (type) {
      case OP.MESSAGE_ADD: {
        if (!name || runtime.messages.indexOf(name) !== -1) return;
        if (typeof vm.addBroadcastMsg === 'function') vm.addBroadcastMsg(name, false);
        break;
      }
      case OP.MESSAGE_RENAME: {
        const from = payload && payload.from;
        const to = payload && payload.to;
        if (!from || !to || from === to) return;
        if (runtime.messages.indexOf(from) !== -1) {
          if (typeof vm.renameBroadcastMsg === 'function') vm.renameBroadcastMsg(from, to, false);
        } else if (runtime.messages.indexOf(to) === -1 && typeof vm.addBroadcastMsg === 'function') {
          // from 不存在（此前未同步到）时直接补建 to，保证远端块字段可用
          vm.addBroadcastMsg(to, false);
        }
        break;
      }
      case OP.MESSAGE_DELETE: {
        if (!name || runtime.messages.indexOf(name) === -1) return;
        if (typeof vm.deleteBroadcastMsg === 'function') vm.deleteBroadcastMsg(name, false);
        break;
      }
      default:
        break;
    }
  }

  // 监视器 op 应用：按 key 对齐本端快照基线，缺失项跳过（等待下次全量快照兜底）。
  // 调用 runtime 标准入口，与本地监视器 UI 的渲染链路完全一致。
  _applyMonitorOp(type, payload) {
    const runtime = this.vm.runtime;
    if (!runtime) return;
    try {
      switch (type) {
        case OP.MONITOR_ADD: {
          const monitor = payload && payload.monitor;
          if (!monitor || !monitor.id) return;
          const st = (runtime.getMonitorState && runtime.getMonitorState()) || null;
          const existing = st ? st.get(monitor.id) : null;
          if (existing) return; // 重放防护：同 id 监视器已存在
          // 远端监视器可能携带该端独有的 id，直接按 payload 完整重建（缺省字段由 VM 补齐）
          if (typeof runtime.requestAddMonitor === 'function') {
            runtime.requestAddMonitor(cloneJson(monitor));
          }
          break;
        }
        case OP.MONITOR_UPDATE: {
          const monitor = payload && payload.monitor;
          if (!monitor || !monitor.id) return;
          const baseline = this.syncMonitorBaseline;
          let base = null;
          if (baseline && payload.key) base = baseline.get(payload.key) || null;
          if (!base) {
            const st = (runtime.getMonitorState && runtime.getMonitorState()) || null;
            base = st ? st.get(monitor.id) : null;
          }
          if (!base) return; // 本端没有该监视器（尚未同步），跳过
          const merged = Object.assign({}, base, cloneJson(monitor));
          if (typeof runtime.requestUpdateMonitor === 'function') {
            runtime.requestUpdateMonitor(monitor.id, merged);
          }
          break;
        }
        case OP.MONITOR_DELETE: {
          const id = payload && payload.id;
          if (!id) return;
          const st = (runtime.getMonitorState && runtime.getMonitorState()) || null;
          if (st && !st.get(id)) return; // 已删除
          if (typeof runtime.requestRemoveMonitor === 'function') {
            runtime.requestRemoveMonitor(id);
          }
          break;
        }
        default:
          break;
      }
    } catch (e) { /* 监视器应用失败不阻塞 op 流 */ }
  }

  async _applyAssetOp(type, payload, meta) {
    const vm = this.vm;
    const runtime = vm.runtime;

    // 需要 asset 的 op：先确保本地 storage 就绪（缺失定向拉取 + 注入等待）
    if (payload && payload.assetRefs && payload.assetRefs.length && this.requestAssets) {
      await this.requestAssets(payload.assetRefs, meta && meta.from);
    }

    switch (type) {
      case OP.SPRITE_ADD: {
        if (runtime.getTargetById(payload.targetId)) return; // 重放
        let json;
        try {
          json = JSON.parse(JSON.stringify(payload.spriteJson));
        } catch (e) {
          console.warn('[op-engine] 丢弃 SPRITE_ADD：spriteJson 非法', e);
          return;
        }
        if (!json || typeof json !== 'object' ||
          ('costumes' in json && !Array.isArray(json.costumes)) ||
          ('sounds' in json && !Array.isArray(json.sounds))) {
          console.warn('[op-engine] 丢弃 SPRITE_ADD：sprite 结构非法');
          return;
        }
        this._attachAssets(json.costumes || []);
        this._attachAssets(json.sounds || []);

        // addSprite 会选中新建角色，会把远端编辑目标抢走，应用后恢复
        const previousEditingTarget = vm.editingTarget ? vm.editingTarget.id : null;
        const before = new Set(runtime.targets.map((t) => t.id));
        await vm.addSprite(json);
        const newTarget = runtime.targets.find((t) => !before.has(t.id));
        // 采纳发起端 targetId，保证各端从此用同一 id 寻址该角色
        if (newTarget) newTarget.id = payload.targetId;
        if (previousEditingTarget && runtime.getTargetById(previousEditingTarget)) {
          vm.setEditingTarget(previousEditingTarget);
        }
        vm.emitTargetsUpdate(false);
        return;
      }
      case OP.SPRITE_DELETE:
        if (runtime.getTargetById(payload.targetId)) vm.deleteSprite(payload.targetId);
        return;
      case OP.SPRITE_RENAME:
        if (runtime.getTargetById(payload.targetId)) vm.renameSprite(payload.targetId, payload.name);
        return;
      case OP.SPRITE_REORDER: {
        const index = runtime.targets.findIndex((t) => t.id === payload.targetId);
        if (index === -1) return;
        vm.reorderTarget(index, payload.newIndex);
        return;
      }
      case OP.EXTENSION_LOAD: {
        const em = vm.extensionManager;
        if (!em) return;
        const target = payload.extensionId;
        if (em.isExtensionLoaded(target)) return;
        if (typeof target === 'string' && /^(https?:|data:|file:)/i.test(target) &&
          typeof em.getExtensionURLs === 'function') {
          const urls = em.getExtensionURLs();
          const alreadyLoaded = Object.keys(urls).find((id) => urls[id] === target);
          if (alreadyLoaded && em.isExtensionLoaded(alreadyLoaded)) return;
        }
        await em.loadExtensionURL(target);
        return;
      }
      case OP.EXTENSION_REMOVE:
        if (vm.extensionManager && typeof vm.extensionManager.removeExtension === 'function') {
          vm.extensionManager.removeExtension(payload.extensionId);
        }
        return;
      case OP.EXTENSION_REORDER:
        if (vm.extensionManager && typeof vm.extensionManager.reorderExtension === 'function') {
          const keys = Array.from(vm.extensionManager._loadedExtensions.keys());
          const currentIndex = keys.indexOf(payload.extensionId);
          if (currentIndex !== -1) {
            vm.extensionManager.reorderExtension(currentIndex, payload.newIndex);
          }
        }
        return;
      default:
        break;
    }

    // 其余 op 作用在某个 target 上：切到目标 target 调用后恢复
    const target = runtime.getTargetById(payload.targetId);
    if (!target) return;
    const previousEditingTarget = vm.editingTarget ? vm.editingTarget.id : null;
    const needsSwitch = previousEditingTarget !== payload.targetId;
    if (needsSwitch) vm.setEditingTarget(payload.targetId);
    try {
      await this._applyEditingTargetOp(type, payload, target);
    } finally {
      if (needsSwitch && previousEditingTarget && runtime.getTargetById(previousEditingTarget)) {
        vm.setEditingTarget(previousEditingTarget);
      }
    }
  }

  async _applyEditingTargetOp(type, payload, target) {
    const vm = this.vm;
    switch (type) {
      case OP.COSTUME_ADD: {
        const c = payload.costume;
        // 重放防护：同 md5 造型已存在则跳过
        if (target.getCostumes().some((existing) => existing.md5 === c.md5)) return;
        const asset = createStorageAsset(vm, c.md5, c.dataFormat);
        const costume = {
          name: c.name,
          md5: c.md5,
          dataFormat: c.dataFormat,
          rotationCenterX: c.rotationCenterX,
          rotationCenterY: c.rotationCenterY,
          bitmapResolution: c.bitmapResolution,
          assetId: c.assetId,
        };
        if (asset) costume.asset = asset;
        await vm.addCostume(c.md5, costume, payload.targetId);
        return;
      }
      case OP.COSTUME_DELETE:
        if (target.getCostumes()[payload.index]) vm.deleteCostume(payload.index);
        return;
      case OP.COSTUME_RENAME:
        if (target.getCostumes()[payload.index]) vm.renameCostume(payload.index, payload.name);
        return;
      case OP.COSTUME_REORDER:
        if (target.getCostumes()[payload.oldIndex]) {
          vm.reorderCostume(payload.targetId, payload.oldIndex, payload.newIndex);
        }
        return;
      case OP.COSTUME_DUPLICATE:
        if (target.getCostumes()[payload.index]) await vm.duplicateCostume(payload.index);
        return;
      case OP.COSTUME_SELECT:
        if (target.getCostumes()[payload.index]) {
          target.setCostume(payload.index);
          vm.runtime.requestTargetsUpdate(target);
        }
        return;
      case OP.COSTUME_UPDATE:
        if (!target.getCostumes()[payload.index]) return;
        if (payload.isVector) {
          vm.updateSvg(payload.index, payload.svg, payload.rotationCenterX, payload.rotationCenterY);
          return;
        }
        await this._applyBitmapUpdate(payload);
        return;
      case OP.SOUND_ADD: {
        const s = payload.sound;
        if (target.getSounds().some((existing) => existing.md5 === s.md5)) return;
        const asset = createStorageAsset(vm, s.md5, s.dataFormat);
        const sound = {
          name: s.name,
          md5: s.md5,
          dataFormat: s.dataFormat,
          assetId: s.assetId,
          rate: s.rate,
          sampleCount: s.sampleCount,
        };
        if (asset) sound.asset = asset;
        await vm.addSound(sound, payload.targetId);
        return;
      }
      case OP.SOUND_DELETE:
        if (target.getSounds()[payload.index]) vm.deleteSound(payload.index);
        return;
      case OP.SOUND_RENAME:
        if (target.getSounds()[payload.index]) vm.renameSound(payload.index, payload.name);
        return;
      case OP.SOUND_REORDER:
        if (target.getSounds()[payload.oldIndex]) {
          vm.reorderSound(payload.targetId, payload.oldIndex, payload.newIndex);
        }
        return;
      case OP.SOUND_DUPLICATE:
        if (target.getSounds()[payload.index]) await vm.duplicateSound(payload.index);
        return;
      case OP.SOUND_UPDATE: {
        if (!target.getSounds()[payload.index]) return;
        const audioData = payload.audioData;
        const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextCtor) return;
        const audioContext = new AudioContextCtor();
        const audioBuffer = audioContext.createBuffer(
          audioData.numberOfChannels,
          audioData.length,
          audioData.sampleRate
        );
        for (let i = 0; i < audioData.numberOfChannels; i++) {
          const channelData = audioBuffer.getChannelData(i);
          const sourceData = audioData.channels[i] || [];
          for (let j = 0; j < sourceData.length; j++) {
            channelData[j] = sourceData[j];
          }
        }
        vm.updateSoundBuffer(payload.index, audioBuffer);
        return;
      }
      case OP.BLOCKS_SHARE:
        await vm.shareBlocksToTarget(payload.blocks, payload.targetId);
        return;
      default:
        break;
    }
  }

  _applyBitmapUpdate(payload) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0);
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          this.vm.updateBitmap(
            payload.index,
            imageData,
            payload.rotationCenterX,
            payload.rotationCenterY,
            payload.bitmapResolution || 2
          );
        } finally {
          resolve();
        }
      };
      img.onerror = () => resolve();
      img.src = payload.bitmapData;
    });
  }

  // 序列化角色里 asset 键是 md5ext（非运行时的 md5），注入 storage 已就绪的资产
  _attachAssets(items) {
    items.forEach((item) => {
      if (!item.md5ext) return;
      const asset = createStorageAsset(this.vm, item.md5ext, item.dataFormat);
      if (asset) {
        item.asset = asset;
        item.assetId = asset.assetId;
      }
    });
  }
}

export {CREATING_BLOCK_TTL_MS, PROCEDURE_WINDOW_DURATION_MS, VMApplier};

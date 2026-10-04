/**
 * Round 270 DEV-only QA workbench (dynamically imported by main.ts when the
 * run started with a valid `?qa=<runId>` query — production builds never
 * load this module).
 *
 * A small fixed watermark marks the QA run at all times. F8 toggles a DOM
 * panel that offers checkpoint export/import over the QA-namespaced storage
 * only:
 *
 * - Export lists the QA slots through the regular engine listing, reads the
 *   selected already-saved slot and downloads a v1 envelope (metadata + the
 *   untouched parsed snapshot). Nothing is synthesized from live state.
 * - Import runs the file through the defensive envelope parser, targets only
 *   QA slots and requires an explicit confirm — defaulting to cancel — when
 *   the target slot already holds bytes. The write goes through the regular
 *   engine slot protocol, so the imported slot loads through the normal
 *   title Continue path.
 *
 * While the panel is open the Phaser keyboard plugin is disabled (native
 * text/file controls keep working); closing restores the previous keyboard
 * state and refocuses the game canvas.
 */

import type Phaser from 'phaser';
import {
  SAVE_SLOT_IDS,
  SAVE_SLOT_LABELS,
  type SaveSlotId,
  type SaveStorage,
  listSaveSlots,
} from '../engine/save-system';
import {
  QA_CHECKPOINT_MAX_BYTES,
  type QaCheckpointEnvelopeV1,
  commitQaImport,
  exportQaSlotSnapshot,
  parseQaCheckpointEnvelope,
  planQaImport,
  qaImportNeedsConfirmation,
} from './qa-checkpoint';

export interface QaWorkbenchOptions {
  game: Phaser.Game;
  /** Validated QA run id from `?qa=` (install is DEV + valid-QA gated). */
  runId: string;
  /** QA-namespaced storage from resolveGameStorage (never the player one). */
  storage: SaveStorage;
  storageAvailable?: boolean;
}

/** Installs the watermark + F8 toggle. Idempotent per page load. */
export function installQaWorkbench(options: QaWorkbenchOptions): void {
  new QaWorkbench(options).install();
}

const PANEL_STYLE: Partial<CSSStyleDeclaration> = {
  position: 'fixed',
  top: '24px',
  left: '50%',
  transform: 'translateX(-50%)',
  zIndex: '20000',
  width: 'min(560px, calc(100vw - 32px))',
  maxHeight: 'calc(100vh - 48px)',
  overflowY: 'auto',
  background: '#10141d',
  color: '#e8ecf4',
  border: '1px solid #3b465c',
  borderRadius: '6px',
  padding: '12px 14px',
  fontSize: '13px',
  lineHeight: '1.5',
  fontFamily: 'monospace',
  boxSizing: 'border-box',
};

class QaWorkbench {
  private readonly game: Phaser.Game;
  private readonly runId: string;
  private readonly storage: SaveStorage;
  private readonly storageAvailable: boolean;

  private panel: HTMLDivElement | null = null;
  private watermark: HTMLDivElement | null = null;
  private keyboardWasEnabled = true;
  private pausedScenes: Phaser.Scene[] = [];
  private open = false;

  /** Pending parsed envelope + target slot awaiting an explicit confirm. */
  private pendingImport: { envelope: QaCheckpointEnvelopeV1; targetSlotId: SaveSlotId; occupied: boolean } | null = null;
  private selectedFile: File | null = null;

  private status: HTMLParagraphElement | null = null;
  private candidateInput: HTMLInputElement | null = null;
  private stageInput: HTMLInputElement | null = null;
  private exportSelect: HTMLSelectElement | null = null;
  private exportButton: HTMLButtonElement | null = null;
  private importTargetSelect: HTMLSelectElement | null = null;
  private importFileInput: HTMLInputElement | null = null;
  private importButton: HTMLButtonElement | null = null;
  private confirmArea: HTMLDivElement | null = null;

  constructor(options: QaWorkbenchOptions) {
    this.game = options.game;
    this.runId = options.runId;
    this.storage = options.storage;
    this.storageAvailable = options.storageAvailable ?? true;
  }

  install(): void {
    this.watermark = document.createElement('div');
    this.watermark.textContent = `QA 运行：${this.runId}（${this.storageAvailable ? 'F8 工作台' : '存储不可用，不能保存/导入'}）`;
    this.watermark.title = `独立 QA 运行标识 ${this.runId}：存档与设置均已与玩家隔离`;
    this.watermark.setAttribute('role', 'status');
    Object.assign(this.watermark.style, {
      position: 'fixed',
      right: '8px',
      bottom: '6px',
      zIndex: '19999',
      padding: '2px 8px',
      background: 'rgba(120, 40, 40, 0.82)',
      color: '#ffe9e9',
      fontSize: '11px',
      fontFamily: 'monospace',
      borderRadius: '4px',
      pointerEvents: 'none',
    } satisfies Partial<CSSStyleDeclaration>);
    document.body.append(this.watermark);

    window.addEventListener('keydown', this.handleToggleKey);
  }

  private readonly handleToggleKey = (event: KeyboardEvent): void => {
    if (event.key !== 'F8') return;
    event.preventDefault();
    if (this.open) this.closePanel();
    else this.openPanel();
  };

  private openPanel(): void {
    if (this.open || this.panel !== null) return;
    this.open = true;

    const keyboard = this.game.input.keyboard;
    this.keyboardWasEnabled = keyboard === null ? true : keyboard.enabled;
    if (keyboard !== null) keyboard.enabled = false; // Native controls keep working.
    this.pausedScenes = this.game.scene.getScenes(true);
    for (const scene of this.pausedScenes) scene.scene.pause();

    this.panel = this.buildPanel();
    document.body.append(this.panel);
    this.refreshExportSlots();
    this.candidateInput?.focus({ preventScroll: true });
  }

  private closePanel(): void {
    if (!this.open || this.panel === null) return;
    this.open = false;
    this.pendingImport = null;
    this.panel.remove();
    this.panel = null;
    this.status = null;
    this.candidateInput = null;
    this.stageInput = null;
    this.exportSelect = null;
    this.exportButton = null;
    this.importTargetSelect = null;
    this.importFileInput = null;
    this.importButton = null;
    this.confirmArea = null;

    const keyboard = this.game.input.keyboard;
    if (keyboard !== null) keyboard.enabled = this.keyboardWasEnabled;
    for (const scene of this.pausedScenes) scene.scene.resume();
    this.pausedScenes = [];
    this.game.canvas?.focus({ preventScroll: true });
  }

  // -------------------------------------------------------------------------
  // Panel DOM
  // -------------------------------------------------------------------------

  private buildPanel(): HTMLDivElement {
    const panel = document.createElement('div');
    panel.role = 'dialog';
    panel.setAttribute('aria-label', `QA 检查点工作台（QA 运行 ${this.runId}）`);
    Object.assign(panel.style, PANEL_STYLE);

    const title = document.createElement('h2');
    title.textContent = 'QA 检查点工作台';
    Object.assign(title.style, { margin: '0 0 4px', fontSize: '15px' });
    panel.append(title);

    const runInfo = document.createElement('p');
    runInfo.textContent = `QA 运行：${this.runId}（${this.storageAvailable ? '存储已隔离' : '存储不可用，不访问玩家槽'}；F8/Esc 关闭）`;
    Object.assign(runInfo.style, { margin: '0 0 10px', color: '#9fb0cc' });
    panel.append(runInfo);

    const fields = document.createElement('div');
    Object.assign(fields.style, { display: 'grid', gap: '6px', margin: '0 0 10px' });
    this.candidateInput = labeledTextInput(fields, '候选版本（candidate）', 'round-270');
    this.stageInput = labeledTextInput(fields, '阶段/检查点标识（stage）', 'stage1-opening');
    panel.append(fields);

    panel.append(this.buildExportSection());
    panel.append(this.buildImportSection());

    this.status = document.createElement('p');
    this.status.setAttribute('aria-live', 'polite');
    Object.assign(this.status.style, { margin: '10px 0 0', minHeight: '1.5em', whiteSpace: 'pre-wrap' });
    panel.append(this.status);

    // The panel owns its key events: nothing inside reaches the game while
    // the keyboard plugin is also disabled — belt and braces.
    panel.addEventListener('keydown', (event) => {
      event.stopPropagation();
      if (event.key === 'F8' || event.key === 'Escape') { event.preventDefault(); this.closePanel(); }
    });
    return panel;
  }

  private buildExportSection(): HTMLFieldSetElement {
    const section = document.createElement('fieldset');
    Object.assign(section.style, { border: '1px solid #3b465c', borderRadius: '4px', margin: '0 0 10px' });
    const legend = document.createElement('legend');
    legend.textContent = '导出检查点（仅限已正常保存的槽位）';
    section.append(legend);

    const row = document.createElement('div');
    Object.assign(row.style, { display: 'flex', gap: '8px', alignItems: 'center', padding: '4px 6px 8px' });

    const slotLabel = document.createElement('label');
    slotLabel.textContent = '来源槽位';
    slotLabel.htmlFor = 'qa-workbench-export-slot';
    this.exportSelect = document.createElement('select');
    this.exportSelect.id = 'qa-workbench-export-slot';
    this.exportSelect.setAttribute('aria-label', '导出来源槽位');
    row.append(slotLabel, this.exportSelect);

    this.exportButton = document.createElement('button');
    this.exportButton.type = 'button';
    this.exportButton.textContent = '导出 JSON';
    this.exportButton.addEventListener('click', () => this.runExport());
    row.append(this.exportButton);
    section.append(row);
    return section;
  }

  private buildImportSection(): HTMLFieldSetElement {
    const section = document.createElement('fieldset');
    Object.assign(section.style, { border: '1px solid #3b465c', borderRadius: '4px', margin: '0' });
    const legend = document.createElement('legend');
    legend.textContent = '导入检查点（只写入 QA 槽位）';
    section.append(legend);

    const body = document.createElement('div');
    Object.assign(body.style, { display: 'grid', gap: '6px', padding: '4px 6px 8px' });

    const fileLabel = document.createElement('label');
    fileLabel.textContent = '检查点文件（JSON）';
    fileLabel.htmlFor = 'qa-workbench-import-file';
    this.importFileInput = document.createElement('input');
    this.importFileInput.type = 'file';
    this.importFileInput.id = 'qa-workbench-import-file';
    this.importFileInput.accept = '.json,application/json';
    this.importFileInput.addEventListener('change', () => {
      this.selectedFile = this.importFileInput?.files?.[0] ?? null;
      this.pendingImport = null;
      this.renderConfirmArea();
    });
    body.append(fileLabel, this.importFileInput);

    const targetLabel = document.createElement('label');
    targetLabel.textContent = '目标 QA 槽位';
    targetLabel.htmlFor = 'qa-workbench-import-target';
    this.importTargetSelect = document.createElement('select');
    this.importTargetSelect.id = 'qa-workbench-import-target';
    this.importTargetSelect.setAttribute('aria-label', '导入目标 QA 槽位');
    for (const slotId of SAVE_SLOT_IDS) {
      const option = document.createElement('option');
      option.value = slotId;
      option.textContent = SAVE_SLOT_LABELS[slotId];
      this.importTargetSelect.append(option);
    }
    body.append(targetLabel, this.importTargetSelect);

    this.importButton = document.createElement('button');
    this.importButton.type = 'button';
    this.importButton.textContent = '开始导入';
    this.importButton.addEventListener('click', () => void this.runImport());
    body.append(this.importButton);

    this.confirmArea = document.createElement('div');
    Object.assign(this.confirmArea.style, { display: 'none' });
    body.append(this.confirmArea);

    section.append(body);
    return section;
  }

  /** Fills the export slot list from the regular engine listing. */
  private refreshExportSlots(): void {
    if (this.exportSelect === null || this.exportButton === null) return;
    this.exportSelect.textContent = '';
    const listing = listSaveSlots(this.storage);
    let exportable = 0;
    if (!listing.ok) {
      this.setStatus(`无法读取存档列表：${listing.message ?? '存储不可用'}`, 'error');
    }
    for (const slot of listing.slots) {
      const option = document.createElement('option');
      option.value = slot.slotId;
      option.textContent = slot.state === 'ok'
        ? `${SAVE_SLOT_LABELS[slot.slotId]}：${slot.displayName ?? '?'} Lv.${slot.level ?? '?'}`
        : `${SAVE_SLOT_LABELS[slot.slotId]}：${slot.state === 'empty' ? '空槽（不可导出）' : '损坏（不可导出）'}`;
      option.disabled = slot.state !== 'ok';
      if (slot.state === 'ok') exportable += 1;
      this.exportSelect.append(option);
    }
    this.exportButton.disabled = exportable === 0;
    if (exportable === 0 && listing.ok) {
      this.setStatus('没有可导出的已保存槽位：请先在游戏中正常保存。', 'info');
    }
  }

  // -------------------------------------------------------------------------
  // Export / import flows
  // -------------------------------------------------------------------------

  private runExport(): void {
    if (!this.storageAvailable) { this.setStatus('QA 存储不可用，不能导出；不会访问玩家存档。', 'error'); return; }
    const slotId = this.exportSelect?.value as SaveSlotId | undefined;
    if (slotId === undefined) return;
    const result = exportQaSlotSnapshot(this.storage, {
      runId: this.runId,
      candidate: this.candidateInput?.value ?? '',
      stage: this.stageInput?.value ?? '',
      slotId,
    });
    if (!result.ok) {
      this.setStatus(`导出失败：${result.message}`, 'error');
      return;
    }
    const { envelope } = result;
    let text: string;
    try {
      text = JSON.stringify(envelope, null, 2);
    } catch (error) {
      this.setStatus(`导出失败：序列化错误（${error instanceof Error ? error.message : String(error)}）`, 'error');
      return;
    }
    const fileName = `qa-checkpoint-${envelope.qaRun}-${envelope.stage}-${envelope.sourceSlotId}.json`;
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(url);
    this.setStatus(
      `已导出 ${fileName}（候选 ${envelope.candidate}，导出于 ${envelope.exportedAt}，来源 ${SAVE_SLOT_LABELS[envelope.sourceSlotId]}，载荷原样未改）。`,
      'ok',
    );
    this.refreshExportSlots();
  }

  private async runImport(): Promise<void> {
    if (!this.storageAvailable) { this.setStatus('QA 存储不可用，不能导入；不会访问玩家存档。', 'error'); return; }
    const targetSlotId = (this.importTargetSelect?.value ?? '') as SaveSlotId;
    if (this.selectedFile === null) {
      this.setStatus('请先选择一个检查点 JSON 文件。', 'error');
      return;
    }
    if (this.selectedFile.size > QA_CHECKPOINT_MAX_BYTES) {
      this.setStatus(
        `文件过大（${this.selectedFile.size} 字节，上限 ${QA_CHECKPOINT_MAX_BYTES}）：已拒绝导入。`,
        'error',
      );
      return;
    }
    let text: string;
    try {
      text = await this.selectedFile.text();
    } catch (error) {
      this.setStatus(`读取文件失败（${error instanceof Error ? error.message : String(error)}）`, 'error');
      return;
    }
    if (text.length > QA_CHECKPOINT_MAX_BYTES) {
      this.setStatus(`文件内容超过上限（${text.length} 字符）：已拒绝导入。`, 'error');
      return;
    }
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch (error) {
      this.setStatus(`文件不是有效 JSON（${error instanceof Error ? error.message : String(error)}）`, 'error');
      return;
    }
    const parsed = parseQaCheckpointEnvelope(raw);
    if (!parsed.ok) {
      this.setStatus(`导入拒绝：${parsed.message}\n${parsed.errors.join('\n')}`, 'error');
      return;
    }
    const plan = planQaImport(this.storage, targetSlotId);
    if (plan.action === 'refuse') {
      this.setStatus(`导入拒绝：${plan.message}`, 'error');
      return;
    }
    if (!qaImportNeedsConfirmation(plan, parsed.envelope.qaRun, this.runId)) {
      this.commitImport(parsed.envelope, targetSlotId);
      return;
    }
    // Existing bytes: explicit confirm required, cancel is the default.
    this.pendingImport = { envelope: parsed.envelope, targetSlotId, occupied: plan.action === 'confirm' };
    this.renderConfirmArea(plan.action === 'confirm' ? plan.existing : null);
    this.setStatus(
      plan.action === 'confirm' ? `目标槽位 ${SAVE_SLOT_LABELS[targetSlotId]} 已有存档，请显式确认覆盖。`
        : '正在复制另一QA运行的真实检查点，请核对来源与目标后确认。',
      'info',
    );
  }

  private commitImport(envelope: QaCheckpointEnvelopeV1, targetSlotId: SaveSlotId): void {
    const result = commitQaImport(this.storage, targetSlotId, envelope.snapshot);
    if (!result.ok) {
      this.setStatus(`导入失败（${result.message}）：目标槽位保持原样。`, 'error');
      return;
    }
    this.pendingImport = null;
    this.renderConfirmArea();
    this.setStatus(
      `已导入到 ${SAVE_SLOT_LABELS[targetSlotId]}（来源 QA 运行 ${envelope.qaRun} / 阶段 ${envelope.stage}）。回到标题画面用「继续游戏」即可正常读回。`,
      'ok',
    );
    this.refreshExportSlots();
  }

  private renderConfirmArea(existingSummary: string | null = null): void {
    if (this.confirmArea === null) return;
    this.confirmArea.textContent = '';
    if (this.pendingImport === null) {
      this.confirmArea.style.display = 'none';
      return;
    }
    const { targetSlotId, envelope, occupied } = this.pendingImport;
    this.confirmArea.style.display = 'grid';
    this.confirmArea.style.gap = '6px';

    const warning = document.createElement('p');
    warning.textContent = !occupied ? `确认导入到当前 QA 运行的${SAVE_SLOT_LABELS[targetSlotId]}（空槽）？`
      : existingSummary === null
      ? `确认覆盖${SAVE_SLOT_LABELS[targetSlotId]}？该槽已有数据（当前无法读取详情），覆盖后无法找回。`
      : `确认覆盖${SAVE_SLOT_LABELS[targetSlotId]}？现有存档 ${existingSummary} 将被永久替换，无法找回。`;
    Object.assign(warning.style, { margin: '0', color: '#ffb3a7' });
    this.confirmArea.append(warning);
    const source = document.createElement('p');
    source.textContent = `来源 ${envelope.qaRun} / ${envelope.candidate} / ${envelope.stage}；角色 ${envelope.snapshot.displayName}。目标运行 ${this.runId}。原检查点保留，正常玩家存档不受影响。`;
    source.style.margin = '0';
    this.confirmArea.append(source);

    const row = document.createElement('div');
    Object.assign(row.style, { display: 'flex', gap: '8px' });
    const cancelButton = document.createElement('button');
    cancelButton.type = 'button';
    cancelButton.textContent = '取消（默认）';
    cancelButton.addEventListener('click', () => {
      this.pendingImport = null;
      this.renderConfirmArea();
      this.setStatus('已取消导入，目标槽位保持原样。', 'info');
    });
    const confirmButton = document.createElement('button');
    confirmButton.type = 'button';
    confirmButton.textContent = `确认${occupied ? '覆盖' : '导入'}${SAVE_SLOT_LABELS[targetSlotId]}`;
    confirmButton.addEventListener('click', () => {
      if (this.pendingImport === null) return;
      const pending = this.pendingImport;
      this.commitImport(pending.envelope, pending.targetSlotId);
    });
    row.append(cancelButton, confirmButton);
    this.confirmArea.append(row);
    cancelButton.focus({ preventScroll: true }); // Cancel is the safe default.
  }

  private setStatus(message: string, kind: 'ok' | 'error' | 'info'): void {
    if (this.status === null) return;
    this.status.textContent = message;
    this.status.style.color = kind === 'error' ? '#ff9d8f' : kind === 'ok' ? '#9fe6a8' : '#e8ecf4';
  }
}

function labeledTextInput(
  container: HTMLElement,
  labelText: string,
  placeholder: string,
): HTMLInputElement {
  const label = document.createElement('label');
  label.textContent = labelText;
  const input = document.createElement('input');
  input.type = 'text';
  input.autocomplete = 'off';
  input.spellcheck = false;
  input.placeholder = placeholder;
  input.setAttribute('aria-label', labelText);
  label.append(input);
  container.append(label);
  return input;
}

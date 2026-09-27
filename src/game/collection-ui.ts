import Phaser from 'phaser';

import {
  getKnownKnowledgeEdges,
  projectKnowledgeCollection,
  type KnowledgeGraph,
  type KnowledgeNodeData,
  type KnowledgeNodeKind,
  type KnowledgeRelation,
} from '../engine/knowledge-graph';
import { uiFontSize } from './settings';
import { addPixelPanelChrome, addPixelSelection, UI_FONT_FAMILY } from './ui-theme';

/** Data-driven collection panel; undiscovered titles and summaries stay hidden. */

const UI = {
  panelStroke: 0x3a4a63,
  primary: '#d8dee9',
  muted: '#8a94a6',
  warning: '#e8b04b',
  known: '#b9d8c4',
  progressBack: 0x252d3a,
  progressFill: 0x83b99b,
  fontFamily: UI_FONT_FAMILY,
} as const;

const PANEL_WIDTH = 850;
const PANEL_HEIGHT = 468;
const VISIBLE_ROWS = 9;
const ROW_HEIGHT = 31;
const FILTERS: readonly (KnowledgeNodeKind | null)[] = [
  null, 'character', 'place', 'faction', 'item', 'martialArt', 'event', 'quest', 'ending',
];
const KIND_LABELS: Record<KnowledgeNodeKind, string> = {
  character: '人物',
  place: '地点',
  faction: '门派',
  item: '物品',
  martialArt: '武学',
  event: '事件',
  quest: '任务',
  ending: '结局',
};
const RELATION_LABELS: Record<KnowledgeRelation, string> = {
  mentorOf: '师徒',
  parentOf: '亲缘',
  hostileTo: '敌对',
  belongsTo: '隶属',
  locatedAt: '位于',
  holds: '持有',
  triggers: '触发',
  requires: '需要',
  rewards: '奖励',
  knows: '知晓',
  participatesIn: '参与',
  influences: '影响',
};

export interface CollectionPanelModel {
  graph: KnowledgeGraph;
  knownNodeIds: ReadonlySet<string>;
}

export interface CollectionPanelOptions {
  onClose?: () => void;
}

type CollectionRow =
  | { kind: 'known'; node: KnowledgeNodeData }
  | { kind: 'locked'; count: number };
type PanelKeyBinding = { key: Phaser.Input.Keyboard.Key; handler: () => void };

export class CollectionPanel {
  private readonly scene: Phaser.Scene;
  private readonly container: Phaser.GameObjects.Container;
  private readonly bindings: PanelKeyBinding[] = [];
  private readonly onClose?: () => void;
  private model: CollectionPanelModel | null = null;
  private filterIndex = 0;
  private selection = 0;
  private openState = false;

  constructor(scene: Phaser.Scene, options: CollectionPanelOptions = {}) {
    this.scene = scene;
    this.onClose = options.onClose;
    this.container = scene.add.container(0, 0).setVisible(false).setDepth(1200);
  }

  get isOpen(): boolean {
    return this.openState;
  }

  open(model: CollectionPanelModel): void {
    if (this.openState) return;
    this.model = model;
    this.filterIndex = 0;
    this.selection = 0;
    this.openState = true;
    this.container.setVisible(true);
    this.bindKeys();
    this.render();
  }

  close(): void {
    if (!this.openState) return;
    this.openState = false;
    this.unbindKeys();
    this.container.setVisible(false);
    this.container.removeAll(true);
    this.model = null;
    this.onClose?.();
  }

  destroy(): void {
    this.close();
    this.container.destroy();
  }

  private bindKeys(): void {
    const keyboard = this.scene.input.keyboard;
    if (keyboard === null) return;
    const codes = Phaser.Input.Keyboard.KeyCodes;
    const pairs: [number, () => void][] = [
      [codes.UP, () => this.moveSelection(-1)],
      [codes.W, () => this.moveSelection(-1)],
      [codes.DOWN, () => this.moveSelection(1)],
      [codes.S, () => this.moveSelection(1)],
      [codes.LEFT, () => this.changeFilter(-1)],
      [codes.A, () => this.changeFilter(-1)],
      [codes.RIGHT, () => this.changeFilter(1)],
      [codes.D, () => this.changeFilter(1)],
      [codes.ESC, () => this.close()],
    ];
    for (const [code, handler] of pairs) {
      const key = keyboard.addKey(code);
      key.on('down', handler);
      this.bindings.push({ key, handler });
    }
  }

  private unbindKeys(): void {
    for (const { key, handler } of this.bindings) key.off('down', handler);
    this.bindings.length = 0;
  }

  private get filter(): KnowledgeNodeKind | null {
    return FILTERS[this.filterIndex] ?? null;
  }

  private get rows(): CollectionRow[] {
    const model = this.model;
    if (model === null) return [];
    const nodes = [...model.graph.nodes.values()].filter((node) => this.filter === null || node.kind === this.filter);
    const known = nodes
      .filter((node) => model.knownNodeIds.has(node.id))
      .sort((a, b) => a.title.localeCompare(b.title, 'zh-Hans-CN'))
      .map((node): CollectionRow => ({ kind: 'known', node }));
    const lockedCount = nodes.length - known.length;
    return lockedCount > 0 ? [...known, { kind: 'locked', count: lockedCount }] : known;
  }

  private moveSelection(delta: number): void {
    const rows = this.rows;
    if (rows.length === 0) return;
    this.selection = (this.selection + delta + rows.length) % rows.length;
    this.render();
  }

  private changeFilter(delta: number): void {
    this.filterIndex = (this.filterIndex + delta + FILTERS.length) % FILTERS.length;
    this.selection = 0;
    this.render();
  }

  private render(): void {
    const model = this.model;
    if (model === null) return;
    this.container.removeAll(true);
    const width = this.scene.scale.width;
    const height = this.scene.scale.height;
    const left = (width - PANEL_WIDTH) / 2;
    const top = (height - PANEL_HEIGHT) / 2;
    addPixelPanelChrome(this.scene, this.container, { x: left, y: top, width: PANEL_WIDTH, height: PANEL_HEIGHT }, 0.86);

    const categories = projectKnowledgeCollection(model.graph, model.knownNodeIds);
    const all = categories.reduce((total, entry) => ({
      discovered: total.discovered + entry.discovered,
      total: total.total + entry.total,
    }), { discovered: 0, total: 0 });
    const category = this.filter === null ? null : categories.find((entry) => entry.kind === this.filter) ?? null;
    const current = category ?? {
      discovered: all.discovered,
      total: all.total,
      percent: all.total === 0 ? 0 : Math.floor((all.discovered / all.total) * 100),
    };
    const categoryLabel = this.filter === null ? '全部' : KIND_LABELS[this.filter];

    this.addText('江湖图鉴', left + 22, top + 14, 19, UI.warning);
    this.addText(`总收录 ${all.discovered}/${all.total} · ${all.total === 0 ? 0 : Math.floor((all.discovered / all.total) * 100)}%`,
      left + 22, top + 43, 11, UI.muted);
    this.addText(`←/→ 类别：${categoryLabel}　·　${current.discovered}/${current.total}　·　${current.percent}%`,
      left + 22, top + 62, 11, UI.known);
    this.addProgressBar(left + 22, top + 84, PANEL_WIDTH - 44, current.percent);
    this.addLine(left + 322, top + 103, left + 322, top + PANEL_HEIGHT - 42);
    this.addText('↑/↓ 浏览 · L 或 Esc 关闭', left + PANEL_WIDTH - 22, top + PANEL_HEIGHT - 23, 10, UI.muted, 'right');

    const rows = this.rows;
    this.selection = rows.length === 0 ? 0 : Math.min(this.selection, rows.length - 1);
    const windowStart = Math.floor(this.selection / VISIBLE_ROWS) * VISIBLE_ROWS;
    const listTop = top + 111;
    if (rows.length === 0) this.addText('此类尚无词条。', left + 22, listTop, 12, UI.muted);
    for (let offset = 0; offset < VISIBLE_ROWS; offset += 1) {
      const row = rows[windowStart + offset];
      if (row === undefined) break;
      const selected = windowStart + offset === this.selection;
      const label = row.kind === 'known'
        ? `${row.node.title}　［${KIND_LABELS[row.node.kind]}］`
        : `未解锁见闻 ×${row.count}`;
      if (selected) {
        addPixelSelection(this.scene, this.container, {
          x: left + 14,
          y: listTop + offset * ROW_HEIGHT - 2,
          width: 292,
          height: ROW_HEIGHT,
        });
      }
      this.addText(`${selected ? '▸ ' : '  '}${label}`,
        left + 22, listTop + offset * ROW_HEIGHT, 12,
        row.kind === 'locked' ? UI.muted : (selected ? UI.warning : UI.known));
    }

    const selected = rows[this.selection];
    const detailX = left + 346;
    const detailWidth = PANEL_WIDTH - 368;
    if (selected === undefined) {
      this.addText('知识图谱资料尚未加载。', detailX, listTop, 13, UI.muted);
      return;
    }
    if (selected.kind === 'locked') {
      this.addText('尚未获知此类见闻', detailX, listTop, 14, UI.primary);
      this.addWrappedText(
        `还有 ${selected.count} 条记录未解锁。探索地图、结识人物、取得物品并学会武学，可逐步补全图鉴。具体名称与内容将在发现后公开。`,
        detailX, listTop + 35, detailWidth, 12, UI.muted,
      );
      return;
    }

    const node = selected.node;
    this.addText(KIND_LABELS[node.kind], detailX, listTop, 10, UI.warning);
    this.addText(node.title, detailX, listTop + 20, 18, UI.primary);
    this.addWrappedText(node.summary, detailX, listTop + 58, detailWidth, 12, UI.primary);
    const edges = getKnownKnowledgeEdges(model.graph, model.knownNodeIds, node.id);
    this.addText('已知关联', detailX, top + 306, 12, UI.warning);
    if (edges.length === 0) {
      this.addText('暂无线索相连。', detailX, top + 332, 11, UI.muted);
      return;
    }
    edges.slice(0, 3).forEach((edge, index) => {
      const otherId = edge.fromId === node.id ? edge.toId : edge.fromId;
      const other = model.graph.nodes.get(otherId);
      if (other === undefined) return;
      const relation = RELATION_LABELS[edge.relation];
      const direction = edge.fromId === node.id
        ? `${relation} → ${other.title}`
        : `${other.title} · ${relation}`;
      const rowY = top + 332 + index * 33;
      this.addText(direction, detailX, rowY, 11, UI.known);
      this.addWrappedText(edge.summary, detailX + 6, rowY + 15, detailWidth - 6, 9, UI.muted);
    });
  }

  private addProgressBar(x: number, y: number, width: number, percent: number): void {
    const background = this.scene.add.rectangle(x, y, width, 6, UI.progressBack).setOrigin(0, 0.5);
    this.container.add(background);
    if (percent <= 0) return;
    const fill = this.scene.add.rectangle(x, y, width * percent / 100, 6, UI.progressFill).setOrigin(0, 0.5);
    this.container.add(fill);
  }

  private addText(
    text: string,
    x: number,
    y: number,
    fontSize: number,
    color: string,
    align: 'left' | 'right' = 'left',
  ): void {
    const node = this.scene.add.text(x, y, text, {
      fontFamily: UI.fontFamily,
      fontSize: uiFontSize(fontSize),
      color,
      align,
    }).setOrigin(align === 'right' ? 1 : 0, 0);
    this.container.add(node);
  }

  private addWrappedText(text: string, x: number, y: number, width: number, fontSize: number, color: string): void {
    const node = this.scene.add.text(x, y, text, {
      fontFamily: UI.fontFamily,
      fontSize: uiFontSize(fontSize),
      color,
      wordWrap: { width },
      lineSpacing: 3,
    }).setOrigin(0, 0);
    this.container.add(node);
  }

  private addLine(x1: number, y1: number, x2: number, y2: number): void {
    const line = this.scene.add.line(0, 0, x1, y1, x2, y2, UI.panelStroke).setOrigin(0, 0);
    this.container.add(line);
  }
}

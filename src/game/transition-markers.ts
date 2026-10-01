/**
 * Round 109 data-driven, non-blocking scene markers for region gates.
 *
 * Problem: the HUD already prompts the E-key gate interaction, but the pixel
 * scene itself showed nothing at the gate cell, so outgoing gates stayed
 * invisible while exploring (e.g. standing next to a gate and seeing only a
 * HUD line). This module projects the world map's authored transitions onto
 * the current grid map and renders a small self-generated pixel arch badge
 * per outgoing gate — rectangles only, no new art assets, no textures.
 *
 * Contract (deliberately small and side-effect free):
 * - Pure half: `projectTransitionGates` filters the *outgoing* transitions of
 *   the current map, resolves the destination region name from the world
 *   map's own region records (it never fabricates coordinates and never
 *   surfaces raw resource ids as narrative) and derives world-pixel positions
 *   plus player-proximity flags. It never mutates its inputs.
 * - Render half: `createTransitionGateMarkers` draws one shared world-layer
 *   container at scroll factor 1, an always-on badge per outgoing gate, a
 *   name/destination label only within the Manhattan label radius, and an
 *   E-key glyph only on orthogonally adjacent cells. Long (MOD) CJK names
 *   wrap through measured grapheme segmentation, never Phaser's native
 *   space-only wordWrap, so the full text always stays inside the width.
 * - Presentation only: no keyboard handlers, no interactive hit areas, no
 *   collision or action changes. NPC/service interaction priority stays
 *   exactly where it is today (GridScene's interact-hint chain); the glyph
 *   only signals "an interaction exists here" and never implies automatic
 *   travel by stepping onto the gate cell.
 * - Idempotent: `update` reuses the same scene objects (redundant text
 *   writes are skipped), `refreshFonts` re-wraps after the live text-scale
 *   setting changed, and `destroy` is a no-op after the first call, so the
 *   renderer is safe to dispose on every map replacement.
 */

import type Phaser from 'phaser';

import type { CellPosition } from '../engine/grid-map';
import type { RegionTransitionData, WorldRegionData } from '../engine/world-map';
import { wrapDialogueText } from './dialogue-layout';
import { uiFontSize } from './settings';
import { UI_FONT_FAMILY, UI_PALETTE } from './ui-theme';

/** Manhattan distance at (and below) which the destination label is drawn. */
export const TRANSITION_MARKER_LABEL_RADIUS = 6;

/**
 * Scene depth of the marker container: above every world layer (layer
 * containers default to 0) and every actor marker, still below the daylight
 * wash (50) and the HUD text (60), so night/weather tints keep applying to
 * the badges while gate labels stay legible.
 */
export const TRANSITION_MARKER_DEPTH = 10;

/** One outgoing gate projected onto the current map, ready for rendering. */
export interface TransitionGateProjection {
  /** Authored transition id; stable sort key, never shown as narrative. */
  transitionId: string;
  /** Authored gate name, the same wording the HUD prompt already uses. */
  gateName: string;
  /**
   * Destination region name resolved from the world map's own region
   * records; null when the destination has no region record (the label then
   * shows the gate name alone — raw resource ids are never displayed).
   */
  destinationRegionName: string | null;
  /** Gate cell in grid coordinates. */
  col: number;
  row: number;
  /** Gate cell centre in world pixels (mapOrigin + cell-centre offset). */
  x: number;
  y: number;
  /** Orthogonal distance to the live player cell; null without one. */
  manhattanDistance: number | null;
  /** Label visibility: a player cell exists and it is within the radius. */
  showDestinationLabel: boolean;
  /** True only on the four orthogonal neighbours of the gate. */
  isAdjacent: boolean;
}

/** Read-only projection inputs; nothing here is ever mutated. */
export interface TransitionGateProjectionInput {
  /** Resource id of the map the player is currently on. */
  mapResourceId: string;
  /** All authored transitions of the world map (usually the assembly list). */
  transitions: readonly RegionTransitionData[];
  /** Region records of the same world map, used to name destinations. */
  regions: readonly WorldRegionData[];
  /** Current map tile size in pixels. */
  tileSize: number;
  /** World-space origin of the current map's render layer. */
  mapOrigin: { x: number; y: number };
  /** Live player cell; omitted or null when no player is placed yet. */
  playerCell?: CellPosition | null;
  /** Label radius override; defaults to {@link TRANSITION_MARKER_LABEL_RADIUS}. */
  destinationLabelRadius?: number;
}

/**
 * Projects every valid outgoing gate of the current map. Pure: same inputs,
 * same outputs, no mutation, no Phaser dependency.
 */
export function projectTransitionGates(
  input: TransitionGateProjectionInput,
): TransitionGateProjection[] {
  const radius = input.destinationLabelRadius ?? TRANSITION_MARKER_LABEL_RADIUS;
  const regionNames = new Map(input.regions.map((region) => [region.mapResourceId, region.name]));
  return input.transitions
    .filter((transition) => transition.from.mapResourceId === input.mapResourceId)
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((transition) => {
      const { col, row } = transition.from;
      const manhattan = input.playerCell === null || input.playerCell === undefined
        ? null
        : Math.abs(col - input.playerCell.col) + Math.abs(row - input.playerCell.row);
      return {
        transitionId: transition.id,
        gateName: transition.name,
        destinationRegionName: regionNames.get(transition.to.mapResourceId) ?? null,
        col,
        row,
        x: input.mapOrigin.x + (col + 0.5) * input.tileSize,
        y: input.mapOrigin.y + (row + 0.5) * input.tileSize,
        manhattanDistance: manhattan,
        showDestinationLabel: manhattan !== null && manhattan <= radius,
        isAdjacent: manhattan === 1,
      };
    });
}

/** Label copy: gate name plus the real destination region when known. */
function gateLabelText(projection: TransitionGateProjection): string {
  return projection.destinationRegionName === null
    ? projection.gateName
    : `${projection.gateName}\n→ ${projection.destinationRegionName}`;
}

/** One gate's scene objects plus the proximity/font-driven refresh. */
interface GateVisual {
  label: Phaser.GameObjects.Text;
  glyphSquare: Phaser.GameObjects.Rectangle;
  keyGlyph: Phaser.GameObjects.Text;
  lastRawText: string;
  apply(projection: TransitionGateProjection): void;
  refreshFont(size: string): void;
}

/** Scene-side options; rendering defaults reuse the shared UI settings. */
export interface TransitionGateMarkerOptions extends TransitionGateProjectionInput {
  /** Font-size resolver; defaults to the settings-aware {@link uiFontSize}. */
  resolveFontSize?: (base: number) => string;
  /** Wrap width for long gate/region (MOD) names; defaults to tileSize * 4. */
  maxLabelWidth?: number;
  /** Optional container depth for scene-specific layering; own default keeps
   * the markers above the world layers and below the daylight wash. */
  depth?: number;
}

/** Handle returned to the owning scene; safe to call in any order. */
export interface TransitionMarkerRenderer {
  /** Refreshes label/E-glyph proximity after the player moved. */
  update(playerCell?: CellPosition | null): void;
  /** Re-applies the resolved font size and re-wraps labels after the live
   * text-scale setting changed; a no-op once destroyed. */
  refreshFonts(): void;
  /** Destroys every scene object; further calls (and updates) are no-ops. */
  destroy(): void;
}

/**
 * Draws non-blocking markers for every outgoing gate of the current map.
 * Creates one world-space container (scroll factor 1) holding a pixel arch
 * badge per gate, plus proximity-gated label and E-glyph objects. It binds
 * no input of any kind — interaction priority stays with the owning scene.
 */
export function createTransitionGateMarkers(
  scene: Phaser.Scene,
  options: TransitionGateMarkerOptions,
): TransitionMarkerRenderer {
  const resolveFontSize = options.resolveFontSize ?? uiFontSize;
  const maxLabelWidth = options.maxLabelWidth ?? options.tileSize * 4;
  const input: TransitionGateProjectionInput = {
    mapResourceId: options.mapResourceId,
    transitions: options.transitions,
    regions: options.regions,
    tileSize: options.tileSize,
    mapOrigin: options.mapOrigin,
    destinationLabelRadius: options.destinationLabelRadius,
  };

  let root: Phaser.GameObjects.Container | null = null;
  let entries: GateVisual[] = [];
  let destroyed = false;

  /**
   * Measured grapheme wrapping. Phaser's native wordWrap only breaks between
   * space-separated words, so authored (and MOD) CJK gate names run past any
   * configured width; the label's own canvas context is font-synced at
   * construction and after setFontSize, so measureText matches what will
   * actually render and every grapheme of the full text is preserved.
   */
  const wrapLabelText = (label: Phaser.GameObjects.Text, raw: string): void => {
    label.setText(
      wrapDialogueText(raw, Math.max(1, maxLabelWidth - 4), (s) => label.context.measureText(s).width).join('\n'),
    );
  };

  /** Pixel arch badge: ground shadow, two posts, lintel, passage dot. */
  const createBadge = (x: number, y: number): Phaser.GameObjects.Rectangle[] => {
    const unit = Math.max(1, Math.round(options.tileSize / 16));
    const width = unit * 7;
    const height = unit * 9;
    const parts: Phaser.GameObjects.Rectangle[] = [
      scene.add.rectangle(x, y + height / 2 - unit / 2, width + unit, unit, UI_PALETTE.shadow),
      scene.add.rectangle(x - width / 2 + unit, y, unit * 2, height - unit, UI_PALETTE.frame),
      scene.add.rectangle(x + width / 2 - unit, y, unit * 2, height - unit, UI_PALETTE.frame),
      scene.add.rectangle(x, y - height / 2 + unit, width, unit * 2, UI_PALETTE.frameLight),
      scene.add.rectangle(x, y, unit, unit, UI_PALETTE.selected),
    ];
    for (const part of parts) part.setScrollFactor(1);
    return parts;
  };

  /** E-key glyph: framed square with the shared font; a hint, not a bind. */
  const createGlyph = (
    x: number,
    y: number,
  ): { square: Phaser.GameObjects.Rectangle; key: Phaser.GameObjects.Text } => {
    const unit = Math.max(1, Math.round(options.tileSize / 16));
    const size = Math.max(unit * 5, 12);
    const square = scene.add.rectangle(x, y, size, size, UI_PALETTE.panel);
    square.setStrokeStyle(1, UI_PALETTE.frameLight, 1);
    const key = scene.add.text(x, y, 'E', {
      fontFamily: UI_FONT_FAMILY,
      fontSize: resolveFontSize(10),
      color: UI_PALETTE.accent,
    }).setOrigin(0.5, 0.5);
    square.setScrollFactor(1);
    key.setScrollFactor(1);
    return { square, key };
  };

  const build = (projections: readonly TransitionGateProjection[]): void => {
    const container = scene.add.container(0, 0);
    // GridScene pins every scene-add product to the camera with a scroll
    // factor of 0 through its ADDED_TO_SCENE hook, so the container and each
    // child re-assert factor 1 explicitly to live in world space.
    if (options.depth !== undefined) container.setDepth(options.depth);
    container.setScrollFactor(1);
    root = container;
    entries = projections.map((projection) => {
      const unit = Math.max(1, Math.round(options.tileSize / 16));
      const badgeHeight = unit * 9;
      const label = scene.add.text(
        projection.x,
        projection.y - badgeHeight / 2 - 4,
        '',
        {
          fontFamily: UI_FONT_FAMILY,
          fontSize: resolveFontSize(10),
          color: UI_PALETTE.text,
          stroke: '#10141d',
          strokeThickness: 2,
        },
      ).setOrigin(0.5, 1);
      label.setScrollFactor(1);
      const glyph = createGlyph(
        projection.x,
        projection.y + badgeHeight / 2 + Math.max(unit * 3, 10),
      );
      container.add([
        ...createBadge(projection.x, projection.y),
        label,
        glyph.square,
        glyph.key,
      ]);
      const visual: GateVisual = {
        label,
        glyphSquare: glyph.square,
        keyGlyph: glyph.key,
        lastRawText: gateLabelText(projection),
        apply(next: TransitionGateProjection): void {
          const text = gateLabelText(next);
          if (text !== visual.lastRawText) {
            wrapLabelText(visual.label, text);
            visual.lastRawText = text;
          }
          visual.label.setVisible(next.showDestinationLabel);
          visual.glyphSquare.setVisible(next.isAdjacent);
          visual.keyGlyph.setVisible(next.isAdjacent);
        },
        refreshFont(size: string): void {
          visual.label.setFontSize(size);
          visual.keyGlyph.setFontSize(size);
          // The wrap width is unchanged but every measure now resolves at the
          // new size, so the same full text re-flows onto different lines.
          wrapLabelText(visual.label, visual.lastRawText);
        },
      };
      wrapLabelText(label, visual.lastRawText);
      visual.label.setVisible(projection.showDestinationLabel);
      visual.glyphSquare.setVisible(projection.isAdjacent);
      visual.keyGlyph.setVisible(projection.isAdjacent);
      return visual;
    });
  };

  build(projectTransitionGates({ ...input, playerCell: options.playerCell ?? null }));

  return {
    update(playerCell?: CellPosition | null): void {
      if (destroyed || root === null) return;
      const projections = projectTransitionGates({ ...input, playerCell: playerCell ?? null });
      if (projections.length !== entries.length) {
        // Defensive rebuild for worlds whose transition list changed mid-run.
        root.destroy();
        build(projections);
        return;
      }
      for (let index = 0; index < projections.length; index += 1) {
        entries[index]!.apply(projections[index]!);
      }
    },
    refreshFonts(): void {
      if (destroyed || root === null) return;
      const size = resolveFontSize(10);
      for (const entry of entries) entry.refreshFont(size);
    },
    destroy(): void {
      if (destroyed || root === null) return;
      destroyed = true;
      root.destroy(); // Phaser containers destroy their children with them.
      root = null;
      entries = [];
    },
  };
}

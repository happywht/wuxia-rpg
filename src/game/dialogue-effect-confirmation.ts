import type { DialogueNodeData, DialogueOptionData } from '../engine/dialogue-graph';
import type { VisibleDialogueOption } from '../engine/dialogue-runtime';

export interface DialogueEffectConfirmation {
  nodeId: string;
  rawIndex: number;
  optionSignature: string;
  label: string;
}

export function requestDialogueEffectConfirmation(node: DialogueNodeData, option: VisibleDialogueOption | undefined): DialogueEffectConfirmation | null {
  if (!option) return null;
  const effects = option.option.effects;
  if (!effects?.length || (node.confirmEffects !== true && !effects.some(effect => effect.kind === 'leaveFaction'))) return null;
  return { nodeId: node.id, rawIndex: option.index, optionSignature: JSON.stringify(option.option), label: option.option.text };
}

/** Resolve against the fresh condition-filtered list, never an old visible index. */
export function resolveDialogueEffectConfirmation(request: DialogueEffectConfirmation, node: DialogueNodeData, visible: readonly VisibleDialogueOption[]): number | null {
  if (node.id !== request.nodeId) return null;
  const index = visible.findIndex(value => value.index === request.rawIndex && JSON.stringify(value.option) === request.optionSignature);
  return index < 0 || requestDialogueEffectConfirmation(node, visible[index]) === null ? null : index;
}

export const DIALOGUE_CONFIRMATION_OPTIONS: readonly DialogueOptionData[] = [
  { text: '先不作决定，返回原选项。', nextNodeId: '' },
  { text: '确认以上选择，按所列代价结算。', nextNodeId: '' },
];

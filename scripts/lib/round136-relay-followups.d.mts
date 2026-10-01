import type { DialogueData } from '../../src/engine/dialogue-graph';
import type { RelayDefinition } from './round105-people-content.mjs';
export const relayFollowups: Record<string, string[]>;
export function addRelayFollowups(conversation: DialogueData, relays: RelayDefinition[]): DialogueData;

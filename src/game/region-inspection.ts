import type { DialogueData } from '../engine/dialogue-graph';
import type { RegionEventData } from '../engine/world-map';

/** Read-only authored inspection, using the existing paged dialogue UI. */
export function regionInspectionConversation(event: RegionEventData, settledText = event.text): DialogueData {
  return {
    id: 'inspection:' + event.id,
    startNodeId: 'read',
    nodes: [{ id: 'read', text: settledText }],
  };
}

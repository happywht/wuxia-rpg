/** Shared vertical budgets; independent of world data and Phaser. */
export function combatLayoutMetrics(resourceFont: number, actionFont: number) {
  const resourceTextHeight = Math.ceil(resourceFont * 1.3);
  const resourceStride = Math.max(30, resourceTextHeight + 17);
  return {
    resourceStride,
    logOffset: Math.max(118, 24 + 30 + resourceStride + resourceTextHeight + 3 + 12 + 12),
    actionRowHeight: Math.max(26, Math.ceil(actionFont * 1.3) + 4),
  };
}

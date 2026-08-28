export function getNativeDragSampleIds(
  draggedSampleId: number,
  selectedIds: ReadonlySet<number>,
  visibleSampleIds: readonly number[],
): number[] {
  if (!selectedIds.has(draggedSampleId)) return [draggedSampleId];

  const orderedSelection = visibleSampleIds.filter((id) => selectedIds.has(id));
  return orderedSelection.length > 0 ? orderedSelection : [draggedSampleId];
}

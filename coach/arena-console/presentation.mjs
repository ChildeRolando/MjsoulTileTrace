// Display metrics deliberately separate execution reliability from decision agreement.
export function runMetrics(summary) {
  if (!summary) return null;
  const selected = summary.selectedCaseCount;
  const succeeded = summary.terminalStatuses.completed;
  return { selected, succeeded, matched: summary.score.matchedCaseCount,
    missingLabels: Math.max(0, succeeded - summary.score.conditionalMatchRate.denominator) };
}

export function aggregateMetrics(runs) {
  return runs.reduce((total, run) => {
    const row = runMetrics(run.summary);
    if (!row) { total.incomplete++; return total; }
    for (const key of ['selected', 'succeeded', 'matched', 'missingLabels']) total[key] += row[key];
    total.archived++;
    return total;
  }, { selected: 0, succeeded: 0, matched: 0, missingLabels: 0, archived: 0, incomplete: 0 });
}

// Old archives keep their original bytes; only their visual hand is sorted here.
export function sortedTiles(tiles) {
  const rank = tile => 'mpsz'.indexOf(tile.id[1]) * 20 + Number(tile.id[0]) * 2 + Number(tile.red);
  return [...tiles].sort((left, right) => rank(left) - rank(right));
}

export function tileAsset(tile) {
  if (!/^(?:[1-9][mps]|[1-7]z)$/.test(tile?.id ?? '')) return null;
  return `/tiles/${tile.red && tile.id[0] === '5' ? '0' + tile.id[1] : tile.id}.svg`;
}

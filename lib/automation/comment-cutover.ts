/** Missing/invalid creation times fail closed for campaigns with a cutoff. */
export function commentAfterCutover(
  cutoff: Date | null | undefined,
  timestamp: string | null | undefined,
): boolean {
  if (!cutoff) return true;
  const created = timestamp ? Date.parse(timestamp) : NaN;
  return Number.isFinite(created) && created > cutoff.getTime();
}

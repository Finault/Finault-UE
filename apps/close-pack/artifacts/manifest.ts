export function buildManifest(
  closeId: string,
  period: string,
  total: number,
  confidence: number,
  sealedAt: string,
  artifacts: Record<string, string>
) {
  return {
    close_id: closeId,
    period,
    total,
    confidence,
    sealed_at: sealedAt,
    artifacts
  };
}

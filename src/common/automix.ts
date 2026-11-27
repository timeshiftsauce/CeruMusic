export const DEFAULT_ANALYSIS_SECONDS = 60
export const MIN_ANALYSIS_SECONDS = 5
export const MAX_ANALYSIS_SECONDS = 300
export const MAX_ANALYSIS_BYTES = 48 * 1024 * 1024

export function normalizeAnalysisSeconds(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(MAX_ANALYSIS_SECONDS, Math.max(MIN_ANALYSIS_SECONDS, Math.round(value)))
    : DEFAULT_ANALYSIS_SECONDS
}

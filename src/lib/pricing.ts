// Hinnat per miljoona tokenia (USD), tarkistettu 22.5.2026
export const MODEL_PRICING_USD = {
  'claude-haiku-4-5': { input: 1.0, output: 5.0 },
  'claude-sonnet-4-6': { input: 3.0, output: 15.0 },
  'claude-opus-4-7': { input: 5.0, output: 25.0 },
} as const

export type ModelId = keyof typeof MODEL_PRICING_USD

export function calculateCostUsd(
  model: string,
  inputTokens: number,
  outputTokens: number
): number {
  const key = (Object.keys(MODEL_PRICING_USD) as ModelId[]).find(k => model.startsWith(k))
  const pricing = key ? MODEL_PRICING_USD[key] : undefined
  if (!pricing) return 0
  return (inputTokens / 1_000_000) * pricing.input + (outputTokens / 1_000_000) * pricing.output
}

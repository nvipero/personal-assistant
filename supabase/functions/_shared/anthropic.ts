const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')!

// Muistiehdotusten (feedback-to-memory) malli — pieni, edullinen Haiku.
const MEMORY_MODEL = 'claude-haiku-4-5-20251001'

export interface AnthropicMessage {
  role: 'user' | 'assistant'
  content: string
}

interface AnthropicResponse {
  content: Array<{ type: string; text: string }>
  usage: {
    input_tokens: number
    output_tokens: number
    cache_creation_input_tokens?: number
    cache_read_input_tokens?: number
  }
  model: string
  stop_reason: string
}

// ----------------------------------------------------------------------------
// Osa 1: mallien allowlist ja mallikohtaiset parametrit
// ----------------------------------------------------------------------------
// Avain = user_settings.summary_model -arvo (mitä kannassa voi olla).
// apiModel = eksplisiittinen, pinnattu ID joka lähtee API-kutsuun (ei aliaksia).
// Tuntematon / null / tyhjä -> DEFAULT_MODEL_KEY + console.warn, ei poikkeusta:
// raportin pitää syntyä joka tapauksessa.
export interface ModelConfig {
  apiModel: string
  maxTokens: number
  temperature?: number            // jätetään pois kokonaan jos undefined
  thinking?: { type: 'disabled' }
  effort?: 'low' | 'medium' | 'high'
}

export const DEFAULT_MODEL_KEY = 'claude-haiku-4-5-20251001'

export const MODEL_ALLOWLIST: Record<string, ModelConfig> = {
  // Oletus / nykyinen tuotantomalli. Haiku 4.5 ei tue adaptive thinkingiä eikä
  // effort-parametria (effort palauttaa virheen), temperature on sallittu.
  'claude-haiku-4-5-20251001': { apiModel: 'claude-haiku-4-5-20251001', maxTokens: 1024, temperature: 0.7 },
  // Kannassa jo oleva alias (user_settings.summary_model oletusarvo) — hyväksytään
  // ja ohjataan samaan pinnattuun ID:hen, jottei se putoa oletukseen turhaan.
  'claude-haiku-4-5':          { apiModel: 'claude-haiku-4-5-20251001', maxTokens: 1024, temperature: 0.7 },
  // Sonnet-mallit: EI temperaturea — Sonnet 5 hylkää ei-default samplausparametrit
  // 400-virheellä. effort: 'low' + reilu max_tokens pitää lyhyen generointitehtävän
  // halpana eikä anna (Sonnet 5:n oletuksena päällä olevan) adaptive thinkingin
  // katkaista vastausta. thinking-parametria EI aseteta eksplisiittisesti.
  'claude-sonnet-4-6':         { apiModel: 'claude-sonnet-4-6', maxTokens: 2048, effort: 'low' },
  'claude-sonnet-5':           { apiModel: 'claude-sonnet-5', maxTokens: 2048, effort: 'low' },
}

export interface ResolvedModel {
  config: ModelConfig
  requestedKey: string
  coerced: boolean
  rejectedValue: string | null
}

export function resolveModel(requested?: string | null): ResolvedModel {
  const key = requested?.trim()
  if (key && MODEL_ALLOWLIST[key]) {
    return { config: MODEL_ALLOWLIST[key], requestedKey: key, coerced: false, rejectedValue: null }
  }
  console.warn(
    `[anthropic] Tuntematon tai puuttuva malli '${requested ?? '(null)'}' — käytetään oletusta ${DEFAULT_MODEL_KEY}`
  )
  return {
    config: MODEL_ALLOWLIST[DEFAULT_MODEL_KEY],
    requestedKey: DEFAULT_MODEL_KEY,
    coerced: true,
    rejectedValue: requested ?? null,
  }
}

export interface AnthropicUsage {
  inputTokens: number               // vain viimeisen cache breakpointin jälkeiset
  outputTokens: number
  cacheCreationInputTokens: number
  cacheReadInputTokens: number
}

export interface GenerateSummaryResult {
  text: string
  model: string
  usage: AnthropicUsage
}

// Matalan tason kutsu: heittää poikkeuksen kaikissa virhetilanteissa
// (ei-2xx, tyhjä/epämuotoinen vastaus). Kutsuja vastaa fallbackista (osa 3).
export async function requestSummary(
  systemPrompt: string,
  messages: AnthropicMessage[],
  config: ModelConfig
): Promise<GenerateSummaryResult> {
  const body: Record<string, unknown> = {
    model: config.apiModel,
    max_tokens: config.maxTokens,
    system: systemPrompt,
    messages,
  }
  if (config.temperature !== undefined) body.temperature = config.temperature
  if (config.thinking) body.thinking = config.thinking
  if (config.effort) body.output_config = { effort: config.effort }

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const errBody = await res.text().catch(() => '')
    throw new Error(`Anthropic API virhe: ${res.status} ${errBody}`)
  }

  const json = await res.json() as AnthropicResponse
  const text = json.content?.find(c => c.type === 'text')?.text ?? ''
  if (!text.trim()) {
    throw new Error('Anthropic API palautti tyhjän tai epämuotoisen vastauksen')
  }

  const u = json.usage
  return {
    text,
    model: json.model ?? config.apiModel,
    usage: {
      inputTokens: u.input_tokens ?? 0,
      outputTokens: u.output_tokens ?? 0,
      cacheCreationInputTokens: u.cache_creation_input_tokens ?? 0,
      cacheReadInputTokens: u.cache_read_input_tokens ?? 0,
    },
  }
}

export async function generateMemorySuggestion(
  feedbackComment: string,
  summaryContext: string
): Promise<{ memory: string | null; category?: string }> {
  const systemPrompt = `Olet apuri joka muuttaa käyttäjän antaman palautteen pysyväksi muistiinpanoksi seuraavia yhteenvetoja varten.

Tehtäväsi on tunnistaa palautteesta käyttäjän preferenssi tai tieto ja muotoilla se ohjeeksi tulevia yhteenvetoja varten.

Säännöt:
- Tallenna AINA jos palaute sisältää: nimitoiveen, tyylipreferenssin, tietoa henkilöistä, toiveen sisällöstä tai muotoilusta
- Vastaa JSON-objektilla: {"memory": "<lyhyt ohje>", "category": "people|preferences|context|feedback"}
- Jätä tallentamatta VAIN jos palaute on täysin kertaluonteinen eikä sisällä mitään yleistettävää (esim. "ok" tai "selvä")
- Älä keksi tietoa joka ei ole palautteessa
- Pidä muisti lyhyenä (max 2 lausetta)
- Kirjoita muisti ohjeena: "Käyttäjän nimi on Niko." tai "Yhteenvedoissa pitäisi..."`

  const userPrompt = `PALAUTE: "${feedbackComment}"
YHTEENVEDON KONTEKSTI: ${summaryContext}`

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MEMORY_MODEL,
      max_tokens: 200,
      temperature: 0.3,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    }),
  })

  if (!res.ok) throw new Error(`Anthropic API virhe: ${res.status}`)

  const json = await res.json() as AnthropicResponse
  const text = json.content.find(c => c.type === 'text')?.text ?? ''

  // Strip markdown code fences if Claude wraps the JSON
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()

  try {
    return JSON.parse(cleaned) as { memory: string | null; category?: string }
  } catch {
    console.error(`generateMemorySuggestion parse error, raw text: ${text}`)
    return { memory: null }
  }
}

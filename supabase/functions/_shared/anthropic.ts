const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')!
const MODEL = 'claude-haiku-4-5'

interface AnthropicMessage {
  role: 'user' | 'assistant'
  content: string
}

interface AnthropicResponse {
  content: Array<{ type: string; text: string }>
  usage: { input_tokens: number; output_tokens: number }
  model: string
  stop_reason: string
}

export async function generateSummary(
  systemPrompt: string,
  messages: AnthropicMessage[]
): Promise<{ text: string; inputTokens: number; outputTokens: number; model: string }> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 800,
      temperature: 0.7,
      system: systemPrompt,
      messages,
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Anthropic API virhe: ${res.status} ${body}`)
  }

  const json = await res.json() as AnthropicResponse
  const text = json.content.find(c => c.type === 'text')?.text ?? ''

  return {
    text,
    inputTokens: json.usage.input_tokens,
    outputTokens: json.usage.output_tokens,
    model: json.model ?? MODEL,
  }
}

export async function generateMemorySuggestion(
  feedbackComment: string,
  summaryContext: string
): Promise<{ memory: string | null; category?: string }> {
  const systemPrompt = `Olet apuri joka muuttaa käyttäjän antaman palautteen pysyväksi muistiinpanoksi seuraavia yhteenvetoja varten.

Käyttäjä antoi yhteenvedosta palautteen. Tehtäväsi on muotoilla palaute yleistettäväksi ohjeeksi, joka voidaan ottaa huomioon kaikissa tulevissa yhteenvedoissa.

Säännöt:
- Jos palaute on yleistettävää, vastaa JSON-objektilla: {"memory": "<lyhyt ohje>", "category": "people|preferences|context|feedback"}
- Jos palaute koskee vain yksittäistä tapausta eikä yleisty, vastaa: {"memory": null}
- Älä keksi tietoa joka ei ole palautteessa
- Pidä muisti lyhyenä (max 2 lausetta)
- Käytä kolmatta persoonaa ("Käyttäjä..." tai "Yhteenvedoissa pitäisi...")`

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
      model: MODEL,
      max_tokens: 200,
      temperature: 0.3,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    }),
  })

  if (!res.ok) throw new Error(`Anthropic API virhe: ${res.status}`)

  const json = await res.json() as AnthropicResponse
  const text = json.content.find(c => c.type === 'text')?.text ?? ''

  try {
    return JSON.parse(text) as { memory: string | null; category?: string }
  } catch {
    return { memory: null }
  }
}

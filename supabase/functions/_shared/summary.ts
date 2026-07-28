// Aamuyhteenvedon LLM-kutsupolun orkestrointi:
//  - Osa 2: token- ja kustannuslogitus (llm_usage)
//  - Osa 3: template-fallback + ylläpitäjän hälytys
//
// Jaettu generate-summary- ja manual-generate-summary-funktioiden kesken, jottei
// logiikkaa tarvitse duplikoida. Ei koske connectoreihin.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { formatInTimeZone } from 'https://esm.sh/date-fns-tz@3'
import {
  requestSummary,
  resolveModel,
  type AnthropicMessage,
  type AnthropicUsage,
} from './anthropic.ts'
import { formatDate } from './prompts.ts'
import { sendPushNotification } from './push.ts'
import type { ConnectorItem } from './types.ts'

type AdminClient = ReturnType<typeof createClient>

// Hinnasto valitaan aina Helsinki-ajan mukaan (Sonnet 5:n tutustumishinta
// päättyy 31.8.2026), ei UTC:n.
const PRICING_TIMEZONE = 'Europe/Helsinki'

// ----------------------------------------------------------------------------
// Osa 2: hinnasto (USD / miljoona tokenia) voimassaolopäivämäärillä
// ----------------------------------------------------------------------------
interface PriceTier {
  validFrom?: string   // 'yyyy-MM-dd', mukaanlukien
  validUntil?: string  // 'yyyy-MM-dd', mukaanlukien
  input: number
  output: number
  cacheWrite: number   // 5 min
  cacheRead: number
}

const PRICING: Record<string, PriceTier[]> = {
  'claude-haiku-4-5-20251001': [
    { input: 1.00, output: 5.00, cacheWrite: 1.25, cacheRead: 0.10 },
  ],
  'claude-sonnet-5': [
    { validUntil: '2026-08-31', input: 2.00, output: 10.00, cacheWrite: 2.50, cacheRead: 0.20 },
    { validFrom: '2026-09-01', input: 3.00, output: 15.00, cacheWrite: 3.75, cacheRead: 0.30 },
  ],
  'claude-sonnet-4-6': [
    { input: 3.00, output: 15.00, cacheWrite: 3.75, cacheRead: 0.30 },
  ],
}

// Palauttaa arvioidun hinnan USD, tai null jos mallia ei ole hinnastossa
// (rivi tallennetaan silti — ei kaadeta kutsua hinnaston puutteeseen).
export function estimateCostUsd(model: string, usage: AnthropicUsage): number | null {
  const tiers = PRICING[model]
  if (!tiers) return null

  const todayHki = formatInTimeZone(new Date(), PRICING_TIMEZONE, 'yyyy-MM-dd')
  const tier =
    tiers.find(t =>
      (!t.validFrom || todayHki >= t.validFrom) &&
      (!t.validUntil || todayHki <= t.validUntil)
    ) ?? tiers[tiers.length - 1]

  const cost =
    (usage.inputTokens / 1e6) * tier.input +
    (usage.outputTokens / 1e6) * tier.output +
    (usage.cacheCreationInputTokens / 1e6) * tier.cacheWrite +
    (usage.cacheReadInputTokens / 1e6) * tier.cacheRead

  return Math.round(cost * 1e6) / 1e6   // numeric(10,6)
}

// ----------------------------------------------------------------------------
// Osa 2: llm_usage-rivin kirjoitus
// ----------------------------------------------------------------------------
interface LlmUsageRow {
  functionName: string
  model: string
  promptVersionId: string | null
  userId: string | null
  runId: string | null
  usage: AnthropicUsage
  estimatedCostUsd: number | null
  status: 'ok' | 'error' | 'fallback'
  errorMessage: string | null
}

async function logLlmUsage(adminClient: AdminClient, row: LlmUsageRow): Promise<void> {
  const { error } = await adminClient.from('llm_usage').insert({
    function_name: row.functionName,
    model: row.model,
    prompt_version_id: row.promptVersionId,
    user_id: row.userId,
    run_id: row.runId,
    input_tokens: row.usage.inputTokens,
    output_tokens: row.usage.outputTokens,
    cache_creation_input_tokens: row.usage.cacheCreationInputTokens,
    cache_read_input_tokens: row.usage.cacheReadInputTokens,
    estimated_cost_usd: row.estimatedCostUsd,
    status: row.status,
    error_message: row.errorMessage,
  })
  // Logituksen epäonnistuminen ei saa kaataa raporttia — ei hiljaista catchia.
  if (error) console.error('[summary] llm_usage-rivin kirjoitus epäonnistui:', error.message)
}

// ----------------------------------------------------------------------------
// Osa 3: ylläpitäjän fallback-hälytys (vain is_admin=true, ei kaikille)
// ----------------------------------------------------------------------------
async function notifyAdminOfFallback(
  adminClient: AdminClient,
  info: { functionName: string; model: string; errorMessage: string }
): Promise<void> {
  const { data: admins, error } = await adminClient
    .from('user_settings')
    .select('user_id')
    .eq('is_admin', true)

  if (error) {
    console.error('[summary] ylläpitäjien haku epäonnistui:', error.message)
    return
  }
  if (!admins?.length) {
    console.warn('[summary] fallback laukesi mutta ylläpitäjää ei ole määritelty (is_admin=true puuttuu)')
    return
  }

  const payload = {
    title: 'Aamuraportti: template-fallback',
    body: `${info.functionName} — malli ${info.model} epäonnistui: ${info.errorMessage}`.slice(0, 180),
    url: '/',
  }

  for (const admin of admins) {
    const { data: subs } = await adminClient
      .from('push_subscriptions')
      .select('id, endpoint, p256dh_key, auth_key')
      .eq('user_id', admin.user_id as string)
    if (!subs?.length) continue

    for (const sub of subs) {
      try {
        const result = await sendPushNotification(
          { endpoint: sub.endpoint as string, p256dh_key: sub.p256dh_key as string, auth_key: sub.auth_key as string },
          payload
        )
        if (result.status === 410 || result.status === 404) {
          await adminClient.from('push_subscriptions').delete().eq('id', sub.id as string)
        }
      } catch (err) {
        console.error('[summary] ylläpitäjän push-notifikaatio epäonnistui:', err)
      }
    }
  }
}

// ----------------------------------------------------------------------------
// Osa 3: deterministinen template samasta jo suodatetusta datasta
// ----------------------------------------------------------------------------
export interface TemplateInput {
  name: string
  date: Date
  events: ConnectorItem[]
  emails: ConnectorItem[]
  weatherBlock: string | null
  pollenBlock: string | null
  todoistBlock: string | null
}

// Selkeä, asiallinen listamuotoinen kooste. Ei yritetä imitoida persoonaa —
// sävy saa olla ilmeisen erilainen. Käyttää täsmälleen samaa dataa jonka LLM
// olisi saanut (connectorien promptText + valmiit blokit).
export function buildTemplateSummary(input: TemplateInput): string {
  const parts: string[] = [
    `Hyvää huomenta, ${input.name}. ${formatDate(input.date)}.`,
    '(Automaattinen kooste — tekstigenerointi ei ollut tilapäisesti käytettävissä.)',
    '',
    'KALENTERI:',
    input.events.length ? input.events.map(e => e.promptText).join('\n') : '- Ei tapahtumia tänään.',
    '',
    'SÄHKÖPOSTI (viimeiset 24 h):',
    input.emails.length ? input.emails.map(e => e.promptText).join('\n') : '- Ei uusia viestejä.',
  ]
  if (input.weatherBlock) { parts.push('', input.weatherBlock) }
  if (input.pollenBlock) { parts.push('', input.pollenBlock) }
  if (input.todoistBlock) { parts.push('', input.todoistBlock) }
  return parts.join('\n')
}

// ----------------------------------------------------------------------------
// Orkestrointi: yritä LLM, palaa templateen kaikissa virhetilanteissa.
// Kirjoittaa aina llm_usage-rivin ja lähettää fallbackissa ylläpitäjähälytyksen.
// ----------------------------------------------------------------------------
export interface SummaryGenParams {
  adminClient: AdminClient
  functionName: string
  userId: string
  runId: string | null
  promptVersionId: string | null
  systemPrompt: string
  messages: AnthropicMessage[]
  modelKey?: string | null
  buildTemplate: () => string
}

export interface SummaryGenResult {
  text: string
  generatedBy: 'llm' | 'template'
  model: string
  usage: AnthropicUsage
}

export async function generateSummaryOrTemplate(params: SummaryGenParams): Promise<SummaryGenResult> {
  const resolved = resolveModel(params.modelKey)   // console.warn jos coerced (osa 1)
  const model = resolved.config.apiModel

  let text: string
  let generatedBy: 'llm' | 'template'
  let status: 'ok' | 'fallback'
  let errorMessage: string | null = null
  let usage: AnthropicUsage = {
    inputTokens: 0,
    outputTokens: 0,
    cacheCreationInputTokens: 0,
    cacheReadInputTokens: 0,
  }

  try {
    const result = await requestSummary(params.systemPrompt, params.messages, resolved.config)
    text = result.text
    usage = result.usage
    generatedBy = 'llm'
    status = 'ok'
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : String(err)
    console.error(`[summary] LLM-kutsu epäonnistui (${model}), käytetään templatea:`, errorMessage)
    text = params.buildTemplate()
    generatedBy = 'template'
    status = 'fallback'
  }

  await logLlmUsage(params.adminClient, {
    functionName: params.functionName,
    model,
    promptVersionId: params.promptVersionId,
    userId: params.userId,
    runId: params.runId,
    usage,
    estimatedCostUsd: estimateCostUsd(model, usage),
    status,
    errorMessage,
  })

  if (status === 'fallback') {
    await notifyAdminOfFallback(params.adminClient, {
      functionName: params.functionName,
      model,
      errorMessage: errorMessage ?? 'tuntematon virhe',
    })
  }

  return { text, generatedBy, model, usage }
}

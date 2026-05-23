import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import type { SummaryContext, ParsedSummaryResponse } from './types.ts'

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const FI_WEEKDAYS = ['sunnuntai', 'maanantai', 'tiistai', 'keskiviikko', 'torstai', 'perjantai', 'lauantai']
const FI_WEEKDAYS_CAP = ['Sunnuntai', 'Maanantai', 'Tiistai', 'Keskiviikko', 'Torstai', 'Perjantai', 'Lauantai']

function formatDate(date: Date): string {
  const d = date.getDate()
  const m = date.getMonth() + 1
  const yyyy = date.getFullYear()
  const weekday = FI_WEEKDAYS_CAP[date.getDay()]
  return `${weekday} ${d}.${m}.${yyyy}`
}

export async function fetchActiveSystemPrompt(): Promise<string> {
  const adminClient = createClient(supabaseUrl, serviceRoleKey)
  const { data, error } = await adminClient
    .from('prompt_versions')
    .select('content')
    .eq('name', 'daily_summary_system')
    .eq('is_active', true)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw new Error(`System-promptin haku epäonnistui: ${error.message}`)
  if (!data) throw new Error('Aktiivista system-promptia ei löydy')
  return data.content as string
}

export async function fetchFewShotExamples(): Promise<Array<{ role: 'user' | 'assistant'; content: string }>> {
  const adminClient = createClient(supabaseUrl, serviceRoleKey)

  const names = [
    'few_shot_example_1_input',
    'few_shot_example_1_output',
    'few_shot_example_2_input',
    'few_shot_example_2_output',
    'few_shot_example_3_input',
    'few_shot_example_3_output',
  ]

  const results = await Promise.all(
    names.map(name =>
      adminClient
        .from('prompt_versions')
        .select('content')
        .eq('name', name)
        .eq('is_active', true)
        .order('version', { ascending: false })
        .limit(1)
        .maybeSingle()
    )
  )

  const messages: Array<{ role: 'user' | 'assistant'; content: string }> = []
  for (let i = 0; i < results.length; i++) {
    const content = results[i].data?.content as string | undefined
    if (!content) continue
    messages.push({ role: i % 2 === 0 ? 'user' : 'assistant', content })
  }

  return messages
}

export function buildUserPrompt(ctx: SummaryContext): string {
  const dateStr = formatDate(ctx.date)
  const lines: string[] = [
    `KÄYTTÄJÄ: ${ctx.userFirstName} (${ctx.userEmail})`,
    `PÄIVÄMÄÄRÄ: ${dateStr}`,
  ]

  if (ctx.specialDay) {
    lines.push(`ERIKOISPÄIVÄ: ${ctx.specialDay}`)
  }

  lines.push('')
  lines.push('PÄIVÄN KALENTERITAPAHTUMAT (kaikki kalenterit):')
  if (ctx.events.length === 0) {
    lines.push('(ei tapahtumia)')
  } else {
    for (const ev of ctx.events) {
      lines.push(ev.promptText)
    }
  }

  lines.push('')
  lines.push('VIIMEISET 24h INBOX-VIESTIT (lukematta jääneet ensin):')
  if (ctx.emails.length === 0) {
    lines.push('(ei viestejä)')
  } else {
    for (const em of ctx.emails) {
      lines.push(em.promptText)
    }
  }

  lines.push('')
  lines.push('Generoi aamuyhteenveto yllä olevien ohjeiden mukaisesti.')

  return lines.join('\n')
}

export function parseSummaryResponse(responseText: string): ParsedSummaryResponse {
  const lines = responseText.split('\n').map(l => l.trim()).filter(Boolean)
  const lastLine = lines[lines.length - 1]

  let referencedEmailIds: string[] = []
  let referencedEventIds: string[] = []
  let summaryText = responseText

  if (lastLine.startsWith('{') && lastLine.endsWith('}')) {
    try {
      const parsed = JSON.parse(lastLine) as {
        referenced_email_ids?: string[]
        referenced_event_ids?: string[]
      }
      referencedEmailIds = parsed.referenced_email_ids ?? []
      referencedEventIds = parsed.referenced_event_ids ?? []
      summaryText = lines.slice(0, -1).join('\n').trim()
    } catch {
      // Jos parsinta epäonnistuu, käytetään koko teksti ja tyhjät viitteet
      console.error('JSON-rivin parsinta epäonnistui, jatketaan ilman viitteitä')
    }
  }

  return { summaryText, referencedEmailIds, referencedEventIds }
}

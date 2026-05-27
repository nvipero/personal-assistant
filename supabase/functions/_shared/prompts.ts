import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import type { SummaryContext, ParsedSummaryResponse } from './types.ts'
import type { WeatherForecast } from './connectors/weather.ts'
import type { PollenData } from './connectors/pollen.ts'

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

export function buildWeatherBlock(w: WeatherForecast): string {
  const lines = [
    `[SÄÄTIEDOT — ${w.place.charAt(0).toUpperCase() + w.place.slice(1)}, ${w.date}]`,
  ]
  if (w.tempAt09 !== null) lines.push(`Aamulla klo 9: ${Math.round(w.tempAt09)} °C`)
  if (w.tempAt17 !== null) lines.push(`Iltapäivällä klo 17: ${Math.round(w.tempAt17)} °C`)
  lines.push(`Päivän korkein: ${Math.round(w.tempMax)} °C`)
  lines.push(`Päivän matalin: ${Math.round(w.tempMin)} °C`)
  if (w.precipitationHours.length > 0) {
    const rainStr = w.precipitationHours.map(p => `klo ${p.hour}: ${p.mm.toFixed(1)} mm/h`).join(', ')
    lines.push(`Sade: ${rainStr}`)
  } else {
    lines.push('Sade: ei sateita')
  }
  if (w.maxWindMs !== null) lines.push(`Tuuli: ${Math.round(w.maxWindMs)} m/s`)
  if (w.symbol) lines.push(`Yleiskuva keskipäivällä: ${w.symbol.description}`)
  return lines.join('\n')
}

export function buildPollenBlock(pollen: PollenData, include: boolean, antihistamine: boolean): string {
  const levelStr = (n: number) => ['ei', 'vähän', 'kohtalaisesti', 'runsaasti'][n] ?? 'ei'

  const lines = [
    `[SIITEPÖLY — Helsinki]`,
    `Nyt: koivu ${levelStr(pollen.today.K)}, heinät ${levelStr(pollen.today.H)}`,
    `Ennuste ${pollen.forecast.range}: koivu ${levelStr(pollen.forecast.K)}, heinät ${levelStr(pollen.forecast.H)}`,
    `Antihistamiinimuistutus tarpeen: ${antihistamine ? 'kyllä' : 'ei'}`,
  ]
  if (pollen.forecast_text) {
    lines.push(`Ennusteen vapaa teksti: """${pollen.forecast_text}"""`)
  }
  lines.push('')
  lines.push('Kirjoita 1–3 lauseen kappale. Jos antihistamiinimuistutus on kyllä, mainitse lääke luontevasti. Jos vapaassa tekstissä mainitaan koivun kukinnan alkaminen Etelä-Suomessa lähipäivinä, nosta se esiin. Älä keksi mitään mitä datassa ei ole.')
  return lines.join('\n')
}

export function parseSummaryResponse(responseText: string): ParsedSummaryResponse {
  const lines = responseText.split('\n')
  const lastNonEmptyIndex = lines.reduce((acc, l, i) => l.trim() ? i : acc, -1)
  const lastNonEmpty = lastNonEmptyIndex >= 0 ? lines[lastNonEmptyIndex].trim() : ''

  let referencedEmailIds: string[] = []
  let referencedEventIds: string[] = []
  let summaryText = responseText.trim()

  if (lastNonEmpty.startsWith('{') && lastNonEmpty.endsWith('}')) {
    try {
      const parsed = JSON.parse(lastNonEmpty) as {
        referenced_email_ids?: string[]
        referenced_event_ids?: string[]
      }
      referencedEmailIds = parsed.referenced_email_ids ?? []
      referencedEventIds = parsed.referenced_event_ids ?? []
      summaryText = lines.slice(0, lastNonEmptyIndex).join('\n').trim()
    } catch {
      // Jos parsinta epäonnistuu, käytetään koko teksti ja tyhjät viitteet
      console.error('JSON-rivin parsinta epäonnistui, jatketaan ilman viitteitä')
    }
  }

  return { summaryText, referencedEmailIds, referencedEventIds }
}

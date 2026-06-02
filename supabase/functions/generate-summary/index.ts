import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { refreshAccessToken } from '../_shared/google.ts'
import { decryptToken } from '../_shared/crypto.ts'
import { generateSummary } from '../_shared/anthropic.ts'
import { fetchActiveSystemPrompt, fetchFewShotExamples, buildUserPrompt, buildWeatherBlock, buildPollenBlock, buildTodoistBlock, parseSummaryResponse } from '../_shared/prompts.ts'
import { fetchUserMemories, formatMemoriesForPrompt } from '../_shared/memory.ts'
import { getSpecialDay } from '../_shared/holidays.ts'
import { googleCalendarConnector } from '../_shared/connectors/google-calendar.ts'
import { gmailConnector } from '../_shared/connectors/gmail.ts'
import { fetchWeather } from '../_shared/connectors/weather.ts'
import { fetchPollenForDate } from '../_shared/connectors/pollen.ts'
import { fetchTodoistTasks } from '../_shared/connectors/todoist.ts'
import { sendPushNotification } from '../_shared/push.ts'
import { formatInTimeZone } from 'https://esm.sh/date-fns-tz@3'

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*' } })
  }

  // Autentikointi: service role -avain Authorizaion-headerissa
  const authHeader = req.headers.get('Authorization') ?? ''
  if (!authHeader.startsWith('Bearer ')) {
    return Response.json({ ok: false, error: 'Ei autentikointia' }, { status: 401 })
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey)

  let body: { user_id?: string }
  try {
    body = await req.json() as { user_id?: string }
  } catch {
    return Response.json({ ok: false, error: 'Virheellinen request body' }, { status: 400 })
  }

  const userId = body.user_id
  if (!userId) {
    return Response.json({ ok: false, error: 'user_id puuttuu' }, { status: 400 })
  }

  try {
    // Hae käyttäjän asetukset
    const { data: settings, error: settingsError } = await adminClient
      .from('user_settings')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle()

    if (settingsError) throw settingsError
    if (!settings) {
      return Response.json({ ok: false, error: 'Käyttäjän asetuksia ei löydy' }, { status: 404 })
    }

    // Hae ja dekryptaa Google-token
    const { data: tokenRow, error: tokenError } = await adminClient
      .from('google_oauth_tokens')
      .select('encrypted_refresh_token, google_email')
      .eq('user_id', userId)
      .maybeSingle()

    if (tokenError) throw tokenError
    if (!tokenRow) {
      return Response.json({ ok: false, error: 'Google-tiliä ei yhdistetty' }, { status: 400 })
    }

    let accessToken: string
    try {
      const refreshToken = await decryptToken(tokenRow.encrypted_refresh_token as unknown as Uint8Array)
      accessToken = await refreshAccessToken(refreshToken)
    } catch (err) {
      // Google-yhteys vanhentunut — merkitään uudelleenautentikoitavaksi
      await adminClient
        .from('user_settings')
        .update({ needs_google_reauth: true })
        .eq('user_id', userId)

      await sendPushToUser(adminClient, userId, {
        title: 'Google-yhteys vanhentunut',
        body: 'Avaa Päivän Assistentti ja yhdistä Google-tilisi uudelleen.',
        url: '/connect-google',
      })

      return Response.json({ ok: false, error: `Google-token vanhentunut: ${String(err)}` }, { status: 400 })
    }

    // Tänään käyttäjän aikavyöhykkeellä — formatInTimeZone tuottaa oikean päivän
    // riippumatta siitä missä UTC-offsetissa ajoympäristö on
    const summaryDate = formatInTimeZone(new Date(), settings.timezone, 'yyyy-MM-dd')
    const [tyear, tmonth, tday] = summaryDate.split('-').map(Number)
    const today = new Date(tyear, tmonth - 1, tday)

    const connectorCtx = {
      userId,
      timezone: settings.timezone,
      date: today,
      userEmail: tokenRow.google_email,
      accessToken,
    }

    const month = today.getMonth() + 1
    const isPollenSeason = month >= 3 && month <= 9

    const [calendarOutput, gmailOutput, weatherForecast, pollenData, todoistData] = await Promise.all([
      googleCalendarConnector.fetch(connectorCtx as Parameters<typeof googleCalendarConnector.fetch>[0]),
      gmailConnector.fetch(connectorCtx as Parameters<typeof gmailConnector.fetch>[0]),
      settings.weather_enabled
        ? fetchWeather({ place: settings.weather_place ?? 'helsinki', date: summaryDate, timezone: settings.timezone })
        : Promise.resolve(null),
      isPollenSeason ? fetchPollenForDate(summaryDate) : Promise.resolve(null),
      fetchTodoistTasks(userId, settings.timezone, summaryDate),
    ])

    // Hae system-prompt ja few-shot esimerkit
    const [baseSystemPrompt, fewShotMessages, memories] = await Promise.all([
      fetchActiveSystemPrompt(),
      fetchFewShotExamples(),
      fetchUserMemories(userId),
    ])

    const memoryBlock = formatMemoriesForPrompt(memories)
    const systemPrompt = memoryBlock ? `${baseSystemPrompt}\n\n${memoryBlock}` : baseSystemPrompt

    // Eriöispäivän tarkistus
    const specialDay = getSpecialDay(today)

    // Haetaan käyttäjän etunimi Google-tokenin kautta (tai fallback emailista)
    const userFirstName = tokenRow.google_email.split('@')[0].split('.')[0]
    const capitalizedName = userFirstName.charAt(0).toUpperCase() + userFirstName.slice(1)

    const weatherBlock = weatherForecast ? buildWeatherBlock(weatherForecast) : null

    const pollenBlock = pollenData ? buildPollenBlock(pollenData) : null

    const todoistBlock = todoistData ? buildTodoistBlock(todoistData) : null

    const userPrompt = buildUserPrompt({
      userFirstName: capitalizedName,
      userEmail: tokenRow.google_email,
      date: today,
      timezone: settings.timezone,
      events: calendarOutput.items,
      emails: gmailOutput.items,
      specialDay: specialDay ?? undefined,
    }) + (weatherBlock ? `\n\n${weatherBlock}` : '')
      + (pollenBlock ? `\n\n${pollenBlock}` : '')
      + (todoistBlock ? `\n\n${todoistBlock}` : '')

    // LLM-kutsu
    const allMessages = [
      ...fewShotMessages,
      { role: 'user' as const, content: userPrompt },
    ]

    const llmResult = await generateSummary(systemPrompt, allMessages, settings.summary_model ?? undefined)
    const { summaryText, referencedEmailIds, referencedEventIds } = parseSummaryResponse(llmResult.text)

    const { data: saved, error: saveError } = await adminClient
      .from('daily_summaries')
      .insert({
        user_id: userId,
        summary_date: summaryDate,
        summary_text: summaryText,
        email_ids: referencedEmailIds,
        event_ids: referencedEventIds,
        input_tokens: llmResult.inputTokens,
        output_tokens: llmResult.outputTokens,
        model: llmResult.model,
      })
      .select('id')
      .single()

    if (saveError) throw saveError

    // Push-notifikaatiot
    const teaser = summaryText.split('\n').slice(0, 2).join(' ')
    await sendPushToUser(adminClient, userId, {
      title: 'Päivän yhteenveto',
      body: teaser.slice(0, 150),
      url: '/',
    })

    return Response.json({ ok: true, summary_id: saved.id })
  } catch (err) {
    console.error('generate-summary virhe:', err)
    return Response.json({ ok: false, error: String(err) }, { status: 500 })
  }
})

async function sendPushToUser(
  adminClient: ReturnType<typeof createClient>,
  userId: string,
  payload: { title: string; body: string; url: string }
) {
  const { data: subs } = await adminClient
    .from('push_subscriptions')
    .select('id, endpoint, p256dh_key, auth_key')
    .eq('user_id', userId)

  if (!subs?.length) return

  await Promise.all(
    subs.map(async sub => {
      const result = await sendPushNotification(
        { endpoint: sub.endpoint, p256dh_key: sub.p256dh_key, auth_key: sub.auth_key },
        payload
      )
      // Poista epäonnistuneet tilaukset (410 Gone / 404 Not Found)
      if (result.status === 410 || result.status === 404) {
        await adminClient.from('push_subscriptions').delete().eq('id', sub.id)
      }
    })
  )
}

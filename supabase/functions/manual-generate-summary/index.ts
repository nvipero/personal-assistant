// manual-generate-summary: sama kuin generate-summary mutta käyttäjän JWT:llä
// Käytetään "Generoi nyt" -napissa asetuksissa

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
const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, x-client-info, apikey',
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS })
  }

  // Autentikointi: käyttäjän JWT
  const authHeader = req.headers.get('Authorization') ?? ''
  if (!authHeader.startsWith('Bearer ')) {
    return Response.json({ ok: false, error: 'Ei autentikointia' }, { status: 401, headers: CORS_HEADERS })
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: { user }, error: userError } = await userClient.auth.getUser()
  if (userError || !user) {
    return Response.json({ ok: false, error: 'Virheellinen token' }, { status: 401, headers: CORS_HEADERS })
  }

  let body: { user_id?: string }
  try {
    body = await req.json() as { user_id?: string }
  } catch {
    body = {}
  }

  // Varmista että user_id vastaa autentikoitua käyttäjää
  const userId = body.user_id ?? user.id
  if (userId !== user.id) {
    return Response.json({ ok: false, error: 'Ei oikeutta' }, { status: 403, headers: CORS_HEADERS })
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey)

  try {
    const { data: settings } = await adminClient
      .from('user_settings')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle()

    if (!settings) {
      return Response.json({ ok: false, error: 'Asetuksia ei löydy' }, { status: 404, headers: CORS_HEADERS })
    }

    const { data: tokenRow } = await adminClient
      .from('google_oauth_tokens')
      .select('encrypted_refresh_token, google_email')
      .eq('user_id', userId)
      .maybeSingle()

    if (!tokenRow) {
      return Response.json({ ok: false, error: 'Google-tiliä ei yhdistetty' }, { status: 400, headers: CORS_HEADERS })
    }

    const refreshToken = await decryptToken(tokenRow.encrypted_refresh_token as unknown as Uint8Array)
    const accessToken = await refreshAccessToken(refreshToken)

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

    const [baseSystemPrompt, fewShotMessages, memories] = await Promise.all([
      fetchActiveSystemPrompt(),
      fetchFewShotExamples(),
      fetchUserMemories(userId),
    ])

    const memoryBlock = formatMemoriesForPrompt(memories)
    const systemPrompt = memoryBlock ? `${baseSystemPrompt}\n\n${memoryBlock}` : baseSystemPrompt
    const specialDay = getSpecialDay(today)

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

    const allMessages = [
      ...fewShotMessages,
      { role: 'user' as const, content: userPrompt },
    ]

    const llmResult = await generateSummary(systemPrompt, allMessages, settings.summary_model ?? undefined)
    const { summaryText, referencedEmailIds, referencedEventIds } = parseSummaryResponse(llmResult.text)

    // Upsert: jos tänään jo on yhteenveto, ylikirjoitetaan
    const { data: saved, error: saveError } = await adminClient
      .from('daily_summaries')
      .upsert({
        user_id: userId,
        summary_date: summaryDate,
        summary_text: summaryText,
        email_ids: referencedEmailIds,
        event_ids: referencedEventIds,
        input_tokens: llmResult.inputTokens,
        output_tokens: llmResult.outputTokens,
        model: llmResult.model,
        generated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,summary_date' })
      .select('id')
      .single()

    if (saveError) throw saveError

    // Push-notifikaatio
    const teaser = summaryText.split('\n').slice(0, 2).join(' ')
    await sendPushToUser(adminClient, userId, {
      title: 'Päivän yhteenveto',
      body: teaser.slice(0, 150),
      url: '/',
    })

    return Response.json({ ok: true, summary_id: saved.id, summary_text: summaryText }, { headers: CORS_HEADERS })
  } catch (err) {
    console.error('manual-generate-summary virhe:', err)
    return Response.json({ ok: false, error: String(err) }, { status: 500, headers: CORS_HEADERS })
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
      if (result.status === 410 || result.status === 404) {
        await adminClient.from('push_subscriptions').delete().eq('id', sub.id)
      }
    })
  )
}

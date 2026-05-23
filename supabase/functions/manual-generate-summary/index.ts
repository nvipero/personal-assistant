// manual-generate-summary: sama kuin generate-summary mutta käyttäjän JWT:llä
// Käytetään "Generoi nyt" -napissa asetuksissa

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { refreshAccessToken } from '../_shared/google.ts'
import { decryptToken } from '../_shared/crypto.ts'
import { generateSummary } from '../_shared/anthropic.ts'
import { fetchActiveSystemPrompt, fetchFewShotExamples, buildUserPrompt, parseSummaryResponse } from '../_shared/prompts.ts'
import { fetchUserMemories, formatMemoriesForPrompt } from '../_shared/memory.ts'
import { getSpecialDay } from '../_shared/holidays.ts'
import { googleCalendarConnector } from '../_shared/connectors/google-calendar.ts'
import { gmailConnector } from '../_shared/connectors/gmail.ts'
import { toZonedTime } from 'https://esm.sh/date-fns-tz@3'

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, content-type',
      },
    })
  }

  // Autentikointi: käyttäjän JWT
  const authHeader = req.headers.get('Authorization') ?? ''
  if (!authHeader.startsWith('Bearer ')) {
    return Response.json({ ok: false, error: 'Ei autentikointia' }, { status: 401 })
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: { user }, error: userError } = await userClient.auth.getUser()
  if (userError || !user) {
    return Response.json({ ok: false, error: 'Virheellinen token' }, { status: 401 })
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
    return Response.json({ ok: false, error: 'Ei oikeutta' }, { status: 403 })
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey)

  try {
    const { data: settings } = await adminClient
      .from('user_settings')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle()

    if (!settings) {
      return Response.json({ ok: false, error: 'Asetuksia ei löydy' }, { status: 404 })
    }

    const { data: tokenRow } = await adminClient
      .from('google_oauth_tokens')
      .select('encrypted_refresh_token, google_email')
      .eq('user_id', userId)
      .maybeSingle()

    if (!tokenRow) {
      return Response.json({ ok: false, error: 'Google-tiliä ei yhdistetty' }, { status: 400 })
    }

    const refreshToken = await decryptToken(tokenRow.encrypted_refresh_token as unknown as Uint8Array)
    const accessToken = await refreshAccessToken(refreshToken)

    const now = new Date()
    const zonedNow = toZonedTime(now, settings.timezone)
    const today = new Date(zonedNow.getFullYear(), zonedNow.getMonth(), zonedNow.getDate())

    const connectorCtx = {
      userId,
      timezone: settings.timezone,
      date: today,
      userEmail: tokenRow.google_email,
      accessToken,
    }

    const [calendarOutput, gmailOutput] = await Promise.all([
      googleCalendarConnector.fetch(connectorCtx as Parameters<typeof googleCalendarConnector.fetch>[0]),
      gmailConnector.fetch(connectorCtx as Parameters<typeof gmailConnector.fetch>[0]),
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

    const userPrompt = buildUserPrompt({
      userFirstName: capitalizedName,
      userEmail: tokenRow.google_email,
      date: today,
      timezone: settings.timezone,
      events: calendarOutput.items,
      emails: gmailOutput.items,
      specialDay: specialDay ?? undefined,
    })

    const allMessages = [
      ...fewShotMessages,
      { role: 'user' as const, content: userPrompt },
    ]

    const llmResult = await generateSummary(systemPrompt, allMessages)
    const { summaryText, referencedEmailIds, referencedEventIds } = parseSummaryResponse(llmResult.text)

    const summaryDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

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
      }, { onConflict: 'user_id,summary_date' })
      .select('id')
      .single()

    if (saveError) throw saveError

    return Response.json({ ok: true, summary_id: saved.id, summary_text: summaryText })
  } catch (err) {
    console.error('manual-generate-summary virhe:', err)
    return Response.json({ ok: false, error: String(err) }, { status: 500 })
  }
})

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { generateMemorySuggestion } from '../_shared/anthropic.ts'

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

  const authHeader = req.headers.get('Authorization') ?? ''
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: { user }, error } = await userClient.auth.getUser()
  if (error || !user) {
    return Response.json({ ok: false, error: 'Ei autentikointia' }, { status: 401, headers: CORS_HEADERS })
  }

  let body: { feedback_id?: string }
  try {
    body = await req.json() as { feedback_id?: string }
  } catch {
    return Response.json({ ok: false, error: 'Virheellinen request body' }, { status: 400, headers: CORS_HEADERS })
  }

  if (!body.feedback_id) {
    return Response.json({ ok: false, error: 'feedback_id vaaditaan' }, { status: 400, headers: CORS_HEADERS })
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey)

  // Hae palaute ja varmista omistajuus
  const { data: feedback } = await adminClient
    .from('summary_feedback')
    .select('*, daily_summaries(summary_text)')
    .eq('id', body.feedback_id)
    .eq('user_id', user.id)
    .maybeSingle()

  if (!feedback) {
    return Response.json({ ok: false, error: 'Palautetta ei löydy' }, { status: 404, headers: CORS_HEADERS })
  }

  if (!feedback.comment) {
    return Response.json({ memory_suggestion: null }, { headers: CORS_HEADERS })
  }

  const summaryText = (feedback.daily_summaries as { summary_text: string } | null)?.summary_text ?? ''
  const contextSnippet = summaryText.slice(0, 300)

  const suggestion = await generateMemorySuggestion(feedback.comment, contextSnippet)

  if (suggestion.memory) {
    await adminClient
      .from('summary_feedback')
      .update({
        generated_memory_suggestion: suggestion.memory,
        suggestion_status: 'pending',
      })
      .eq('id', body.feedback_id)
  }

  return Response.json({
    memory_suggestion: suggestion.memory,
    category: suggestion.category ?? null,
  }, { headers: CORS_HEADERS })
})

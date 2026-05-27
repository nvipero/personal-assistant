import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const TODOIST_CLIENT_ID = Deno.env.get('TODOIST_CLIENT_ID')!

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, x-client-info, apikey',
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS })

  const authHeader = req.headers.get('Authorization') ?? ''
  if (!authHeader.startsWith('Bearer '))
    return Response.json({ ok: false, error: 'Ei autentikointia' }, { status: 401, headers: CORS_HEADERS })

  const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } })
  const { data: { user }, error: userError } = await userClient.auth.getUser()
  if (userError || !user)
    return Response.json({ ok: false, error: 'Virheellinen token' }, { status: 401, headers: CORS_HEADERS })

  let body: { redirect_uri?: string }
  try { body = await req.json() } catch { body = {} }
  if (!body.redirect_uri)
    return Response.json({ ok: false, error: 'redirect_uri vaaditaan' }, { status: 400, headers: CORS_HEADERS })

  const stateBytes = new Uint8Array(32)
  crypto.getRandomValues(stateBytes)
  const state = Array.from(stateBytes).map(b => b.toString(16).padStart(2, '0')).join('')

  const adminClient = createClient(supabaseUrl, serviceRoleKey)
  const { error: stateError } = await adminClient
    .from('oauth_states')
    .insert({ state, user_id: user.id, provider: 'todoist' })

  if (stateError)
    return Response.json({ ok: false, error: 'State-tallennus epäonnistui' }, { status: 500, headers: CORS_HEADERS })

  const params = new URLSearchParams({
    client_id: TODOIST_CLIENT_ID,
    scope: 'data:read',
    state,
    response_type: 'code',
    redirect_uri: body.redirect_uri,
  })

  const redirectUrl = `https://app.todoist.com/oauth/authorize?${params.toString()}`
  return Response.json({ ok: true, redirectUrl }, { headers: CORS_HEADERS })
})

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { encryptToken } from '../_shared/crypto.ts'

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const TODOIST_CLIENT_ID = Deno.env.get('TODOIST_CLIENT_ID')!
const TODOIST_CLIENT_SECRET = Deno.env.get('TODOIST_CLIENT_SECRET')!

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

  let body: { code?: string; state?: string; redirect_uri?: string }
  try { body = await req.json() } catch { body = {} }
  if (!body.code || !body.state || !body.redirect_uri)
    return Response.json({ ok: false, error: 'code, state ja redirect_uri vaaditaan' }, { status: 400, headers: CORS_HEADERS })

  const adminClient = createClient(supabaseUrl, serviceRoleKey)

  const { data: stateRow } = await adminClient
    .from('oauth_states')
    .select('user_id, provider')
    .eq('state', body.state)
    .eq('provider', 'todoist')
    .maybeSingle()

  if (!stateRow || stateRow.user_id !== user.id)
    return Response.json({ ok: false, error: 'Virheellinen tai vanhentunut state' }, { status: 400, headers: CORS_HEADERS })

  await adminClient.from('oauth_states').delete().eq('state', body.state)

  try {
    const tokenRes = await fetch('https://api.todoist.com/oauth/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: TODOIST_CLIENT_ID,
        client_secret: TODOIST_CLIENT_SECRET,
        code: body.code,
        redirect_uri: body.redirect_uri,
      }),
    })

    if (!tokenRes.ok) {
      const err = await tokenRes.text()
      throw new Error(`Token exchange epäonnistui: ${tokenRes.status} ${err}`)
    }

    const tokenData = await tokenRes.json() as { access_token: string; token_type: string }
    const encryptedToken = await encryptToken(tokenData.access_token)

    const { error: upsertError } = await adminClient
      .from('user_integrations')
      .upsert({
        user_id: user.id,
        provider: 'todoist',
        access_token: encryptedToken,
        scopes: ['data:read'],
        connected_at: new Date().toISOString(),
        revoked_at: null,
      }, { onConflict: 'user_id,provider' })

    if (upsertError) throw upsertError

    return Response.json({ ok: true }, { headers: CORS_HEADERS })
  } catch (err) {
    console.error('todoist-oauth-callback virhe:', err)
    return Response.json({ ok: false, error: String(err) }, { status: 500, headers: CORS_HEADERS })
  }
})

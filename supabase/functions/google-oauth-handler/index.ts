import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { exchangeCodeForTokens, getUserInfo } from '../_shared/google.ts'
import { encryptToken } from '../_shared/crypto.ts'

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, x-client-info, apikey',
}

const REQUIRED_SCOPES = [
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/gmail.readonly',
]

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS })
  }

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

  let body: { code?: string; redirect_uri?: string }
  try {
    body = await req.json() as { code?: string; redirect_uri?: string }
  } catch {
    return Response.json({ ok: false, error: 'Virheellinen request body' }, { status: 400, headers: CORS_HEADERS })
  }

  if (!body.code || !body.redirect_uri) {
    return Response.json({ ok: false, error: 'code ja redirect_uri vaaditaan' }, { status: 400, headers: CORS_HEADERS })
  }

  try {
    const tokens = await exchangeCodeForTokens(body.code, body.redirect_uri)

    const grantedScopes = tokens.scope.split(' ')
    const missingScopes = REQUIRED_SCOPES.filter(s => !grantedScopes.includes(s))
    if (missingScopes.length > 0) {
      return Response.json(
        { ok: false, error: `Puuttuvat scopet: ${missingScopes.join(', ')}` },
        { status: 400, headers: CORS_HEADERS }
      )
    }

    const userInfo = await getUserInfo(tokens.accessToken)
    const encryptedToken = await encryptToken(tokens.refreshToken)

    const adminClient = createClient(supabaseUrl, serviceRoleKey)

    const { error: tokenError } = await adminClient
      .from('google_oauth_tokens')
      .upsert({
        user_id: user.id,
        encrypted_refresh_token: encryptedToken,
        scopes: grantedScopes,
        google_email: userInfo.email,
        connected_at: new Date().toISOString(),
        last_refreshed_at: new Date().toISOString(),
      }, { onConflict: 'user_id' })

    if (tokenError) throw tokenError

    await adminClient
      .from('user_settings')
      .upsert({
        user_id: user.id,
        summary_time: '07:00',
        timezone: 'Europe/Helsinki',
        push_enabled: true,
        needs_google_reauth: false,
        google_email: userInfo.email,
      }, { onConflict: 'user_id' })

    return Response.json({ ok: true, google_email: userInfo.email }, { headers: CORS_HEADERS })
  } catch (err) {
    console.error('google-oauth-handler virhe:', err)
    return Response.json({ ok: false, error: String(err) }, { status: 500, headers: CORS_HEADERS })
  }
})

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, x-client-info, apikey',
}

interface PushSubscriptionInput {
  endpoint: string
  keys?: { p256dh: string; auth: string }
  p256dh?: string
  auth?: string
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

  let body: { subscription?: PushSubscriptionInput; user_agent?: string }
  try {
    body = await req.json() as { subscription?: PushSubscriptionInput; user_agent?: string }
  } catch {
    return Response.json({ ok: false, error: 'Virheellinen request body' }, { status: 400, headers: CORS_HEADERS })
  }

  const sub = body.subscription
  if (!sub?.endpoint) {
    return Response.json({ ok: false, error: 'subscription.endpoint vaaditaan' }, { status: 400, headers: CORS_HEADERS })
  }

  const p256dh = sub.keys?.p256dh ?? sub.p256dh ?? ''
  const auth = sub.keys?.auth ?? sub.auth ?? ''

  const adminClient = createClient(supabaseUrl, serviceRoleKey)
  const { error: upsertError } = await adminClient
    .from('push_subscriptions')
    .upsert({
      user_id: user.id,
      endpoint: sub.endpoint,
      p256dh_key: p256dh,
      auth_key: auth,
      user_agent: body.user_agent ?? null,
      last_used_at: new Date().toISOString(),
    }, { onConflict: 'user_id,endpoint' })

  if (upsertError) {
    return Response.json({ ok: false, error: upsertError.message }, { status: 500, headers: CORS_HEADERS })
  }

  return Response.json({ ok: true }, { headers: CORS_HEADERS })
})

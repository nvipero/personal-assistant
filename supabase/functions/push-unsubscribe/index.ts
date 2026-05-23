import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

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

  const authHeader = req.headers.get('Authorization') ?? ''
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: { user }, error } = await userClient.auth.getUser()
  if (error || !user) {
    return Response.json({ ok: false, error: 'Ei autentikointia' }, { status: 401 })
  }

  let body: { endpoint?: string }
  try {
    body = await req.json() as { endpoint?: string }
  } catch {
    return Response.json({ ok: false, error: 'Virheellinen request body' }, { status: 400 })
  }

  if (!body.endpoint) {
    return Response.json({ ok: false, error: 'endpoint vaaditaan' }, { status: 400 })
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey)
  await adminClient
    .from('push_subscriptions')
    .delete()
    .eq('user_id', user.id)
    .eq('endpoint', body.endpoint)

  return Response.json({ ok: true })
})

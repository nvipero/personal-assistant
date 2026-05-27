import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

function parseLevel(line: string, species: string): number {
  const match = line.match(new RegExp(species + '\\s+(KKK|KK|K|0)', 'i'))
  if (!match) return 0
  const val = match[1].toUpperCase()
  if (val === 'KKK') return 3
  if (val === 'KK') return 2
  if (val === 'K') return 1
  return 0
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*' } })
  }

  const month = new Date().getMonth() + 1
  if (month < 3 || month > 9) {
    return Response.json({ ok: true, skipped: true })
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey)

  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 10000)

    let buf: ArrayBuffer
    try {
      const res = await fetch('http://www.sptied.fi/sptied.txt', { signal: controller.signal })
      buf = await res.arrayBuffer()
    } finally {
      clearTimeout(timer)
    }

    const text = new TextDecoder('iso-8859-1').decode(buf)

    let bulletinDate: string
    const headerMatch = text.match(/SIITEP[ÖO]LYTIEDOTUS\s+(\d{1,2})\.(\d{1,2})\.(\d{4})/)
    if (headerMatch) {
      bulletinDate = `${headerMatch[3]}-${headerMatch[2].padStart(2, '0')}-${headerMatch[1].padStart(2, '0')}`
    } else {
      const tilanneMatch = text.match(/TILANNE\s+(\d{1,2})\.(\d{1,2})\.(\d{4})/)
      if (!tilanneMatch) {
        console.error('fetch-pollen: päivämäärää ei löydy tiedostosta')
        return Response.json({ ok: false, error: 'bulletin_date not found' })
      }
      bulletinDate = `${tilanneMatch[3]}-${tilanneMatch[2].padStart(2, '0')}-${tilanneMatch[1].padStart(2, '0')}`
    }

    const tilanneBlock = text.match(/TILANNE[\s\S]*?(?=ENNUSTE|TEKSTIT|\(TEKSTIT\))/)?.[0] ?? ''
    const helsinkiTilanne = tilanneBlock.match(/Helsinki[^\n]*/i)?.[0] ?? ''
    const todayK = parseLevel(helsinkiTilanne, 'Koivu')
    const todayH = parseLevel(helsinkiTilanne, 'Hein')

    const ennusteHeaderMatch = text.match(/ENNUSTE\s+([\d.\-]+)/)
    const forecastRange = ennusteHeaderMatch?.[1] ?? ''
    const ennusteBlock = text.match(/ENNUSTE[\s\S]*?(?=\(TEKSTIT\)|$)/)?.[0] ?? ''
    const helsinkiEnnuste = ennusteBlock.match(/Helsinki[^\n]*/i)?.[0] ?? ''
    const forecastK = parseLevel(helsinkiEnnuste, 'Koivu')
    const forecastH = parseLevel(helsinkiEnnuste, 'Hein')

    const tekstit = text.match(/\(TEKSTIT\)([\s\S]*)/)?.[1] ?? ''
    const forecastText = tekstit.match(/ENNUSTE\s*\n([\s\S]*?)(?:\n\n|\n[A-Z]|$)/)?.[1]?.trim() ?? ''

    const parsed = {
      helsinki: {
        today: { K: todayK, H: todayH },
        forecast: { K: forecastK, H: forecastH, range: forecastRange },
      },
      forecast_text: forecastText,
    }

    const { error } = await adminClient
      .from('pollen_bulletin')
      .upsert({ bulletin_date: bulletinDate, raw_text: text, parsed }, { onConflict: 'bulletin_date' })

    if (error) {
      console.error('fetch-pollen: upsert epäonnistui', error)
      return Response.json({ ok: false, error: error.message })
    }

    return Response.json({ ok: true, bulletin_date: bulletinDate })
  } catch (err) {
    console.error('fetch-pollen virhe:', err)
    return Response.json({ ok: false, error: String(err) })
  }
})

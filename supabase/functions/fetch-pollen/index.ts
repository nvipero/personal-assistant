import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { parseBulletin } from './parser.ts'

const POLLEN_URL = 'https://siirto.siitepoly.fi/media/sptied.txt'
const CITY = 'Helsinki'
const SEASON_MONTHS = [3, 4, 5, 6, 7, 8, 9]

Deno.serve(async () => {
  const helsinkiMonth = parseInt(
    new Date().toLocaleString('en-US', { timeZone: 'Europe/Helsinki', month: 'numeric' })
  )
  if (!SEASON_MONTHS.includes(helsinkiMonth)) {
    return Response.json({ skipped: 'off-season', month: helsinkiMonth })
  }

  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 10000)
    let buf: ArrayBuffer
    try {
      const res = await fetch(POLLEN_URL, { signal: controller.signal })
      if (!res.ok) throw new Error(`HTTP ${res.status} from ${POLLEN_URL}`)
      buf = await res.arrayBuffer()
    } finally {
      clearTimeout(timer)
    }

    const rawText = new TextDecoder('iso-8859-1').decode(buf)
    const parsed = parseBulletin(rawText, CITY)

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { error } = await supabase
      .from('pollen_bulletin')
      .upsert(
        {
          bulletin_date: parsed.bulletinDate,
          raw_text: rawText,
          parsed: parsed.data,
          fetched_at: new Date().toISOString(),
        },
        { onConflict: 'bulletin_date' }
      )

    if (error) throw error

    return Response.json({ ok: true, bulletin_date: parsed.bulletinDate })
  } catch (err) {
    console.error('fetch-pollen failed:', err)
    return Response.json({ error: String(err instanceof Error ? err.message : err) }, { status: 500 })
  }
})

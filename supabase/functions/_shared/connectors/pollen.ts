import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const SEASON_MONTHS = [3, 4, 5, 6, 7, 8, 9]
const STALE_THRESHOLD_DAYS = 3

export type PollenData = {
  today: { K: number; H: number }
  forecast: { K: number; H: number; range: string }
  forecast_text: string
  bulletinDate: string
  antihistamine_reminder: boolean
}

export async function fetchPollenForDate(date: string): Promise<PollenData | null> {
  // Kausiportti Helsinki-aikavyöhykkeellä
  const helsinkiMonth = parseInt(
    new Date().toLocaleString('en-US', { timeZone: 'Europe/Helsinki', month: 'numeric' })
  )
  if (!SEASON_MONTHS.includes(helsinkiMonth)) return null

  try {
    const client = createClient(supabaseUrl, serviceRoleKey)
    const { data, error } = await client
      .from('pollen_bulletin')
      .select('bulletin_date, parsed')
      .order('bulletin_date', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error || !data) return null

    // Vanhentumistarkistus
    const ageDays = (Date.now() - new Date(data.bulletin_date).getTime()) / (1000 * 60 * 60 * 24)
    if (ageDays > STALE_THRESHOLD_DAYS) return null

    const hki = (data.parsed as { helsinki: { today: Record<string, number>; forecast: Record<string, number> & { range: string } }; forecast_text: string }).helsinki
    const today = { K: hki.today['K'] ?? 0, H: hki.today['H'] ?? 0 }
    const forecast = {
      K: hki.forecast['K'] ?? 0,
      H: hki.forecast['H'] ?? 0,
      range: hki.forecast['range'] ?? '',
    }

    const antihistamine_reminder =
      today.K >= 2 || today.H >= 2 || forecast.K >= 2 || forecast.H >= 2

    return {
      today,
      forecast,
      forecast_text: (data.parsed as { forecast_text: string }).forecast_text ?? '',
      bulletinDate: data.bulletin_date,
      antihistamine_reminder,
    }
  } catch {
    return null
  }
}

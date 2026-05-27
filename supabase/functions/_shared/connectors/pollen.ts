import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

export type PollenData = {
  today: { K: number; H: number }
  forecast: { K: number; H: number; range: string }
  forecast_text: string
  bulletinDate: string
}

export async function fetchPollenForDate(date: string): Promise<PollenData | null> {
  try {
    const client = createClient(supabaseUrl, serviceRoleKey)
    const { data, error } = await client
      .from('pollen_bulletin')
      .select('bulletin_date, parsed, fetched_at')
      .gte('bulletin_date', dateMinus3Days(date))
      .lte('bulletin_date', date)
      .order('bulletin_date', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error || !data) return null

    const parsed = data.parsed as {
      helsinki: {
        today: { K: number; H: number }
        forecast: { K: number; H: number; range: string }
      }
      forecast_text: string
    }

    return {
      today: parsed.helsinki.today,
      forecast: parsed.helsinki.forecast,
      forecast_text: parsed.forecast_text,
      bulletinDate: data.bulletin_date,
    }
  } catch {
    return null
  }
}

function dateMinus3Days(dateStr: string): string {
  const d = new Date(dateStr)
  d.setDate(d.getDate() - 3)
  return d.toISOString().slice(0, 10)
}

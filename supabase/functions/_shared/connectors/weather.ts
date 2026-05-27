import { formatInTimeZone } from 'https://esm.sh/date-fns-tz@3'
import { describeSymbol } from './weatherSymbols.ts'

export type WeatherForecast = {
  place: string
  date: string
  tempAt09: number | null
  tempAt17: number | null
  tempMax: number
  tempMin: number
  precipitationHours: Array<{ hour: number; mm: number }>
  maxWindMs: number | null
  symbol: { code: number; description: string } | null
}

export async function fetchWeather(opts: {
  place: string
  date: string
  timezone: string
}): Promise<WeatherForecast | null> {
  try {
    const url =
      `https://opendata.fmi.fi/wfs?service=WFS&version=2.0.0&request=getFeature` +
      `&storedquery_id=fmi::forecast::harmonie::surface::point::timevaluepair` +
      `&place=${encodeURIComponent(opts.place)}` +
      `&parameters=Temperature,Precipitation1h,WindSpeedMS,SmartSymbol&timestep=60`

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 8000)

    let xml: string
    try {
      const res = await fetch(url, { signal: controller.signal })
      xml = await res.text()
    } finally {
      clearTimeout(timer)
    }

    const memberRegex = /<wfs:member>([\s\S]*?)<\/wfs:member>/g
    const paramRegex = /gml:id="[^"]*--([A-Za-z0-9]+)"/
    const pairRegex = /<wml2:time>([^<]+)<\/wml2:time>[\s\S]*?<wml2:value>([^<]+)<\/wml2:value>/g

    type DataPoint = { localDate: string; localHour: number; value: number }

    const data: Record<string, DataPoint[]> = {}

    let memberMatch: RegExpExecArray | null
    while ((memberMatch = memberRegex.exec(xml)) !== null) {
      const block = memberMatch[1]
      const paramMatch = paramRegex.exec(block)
      if (!paramMatch) continue
      const param = paramMatch[1]

      if (!data[param]) data[param] = []

      let pairMatch: RegExpExecArray | null
      pairRegex.lastIndex = 0
      while ((pairMatch = pairRegex.exec(block)) !== null) {
        const utcStr = pairMatch[1]
        const rawValue = pairMatch[2]
        if (rawValue === 'NaN') continue
        const value = parseFloat(rawValue)
        if (!isFinite(value)) continue

        const localDate = formatInTimeZone(new Date(utcStr), opts.timezone, 'yyyy-MM-dd')
        const localHour = parseInt(formatInTimeZone(new Date(utcStr), opts.timezone, 'H'), 10)

        data[param].push({ localDate, localHour, value })
      }
    }

    const tempPoints = (data['Temperature'] ?? []).filter(p => p.localDate === opts.date)
    if (tempPoints.length === 0) return null

    const tempAt09Point = tempPoints.find(p => p.localHour === 9)
    const tempAt17Point = tempPoints.find(p => p.localHour === 17)
    const tempAt09 = tempAt09Point?.value ?? null
    const tempAt17 = tempAt17Point?.value ?? null
    const tempMax = Math.max(...tempPoints.map(p => p.value))
    const tempMin = Math.min(...tempPoints.map(p => p.value))

    const precipPoints = (data['Precipitation1h'] ?? []).filter(
      p => p.localDate === opts.date && p.value > 0.05
    )
    const precipitationHours = precipPoints.map(p => ({ hour: p.localHour, mm: p.value }))

    const windPoints = (data['WindSpeedMS'] ?? []).filter(p => p.localDate === opts.date)
    const rawMaxWind = windPoints.length > 0 ? Math.max(...windPoints.map(p => p.value)) : null
    const maxWindMs = rawMaxWind !== null && rawMaxWind >= 7 ? rawMaxWind : null

    const symbolPoints = (data['SmartSymbol'] ?? []).filter(p => p.localDate === opts.date)
    let symbol: { code: number; description: string } | null = null
    if (symbolPoints.length > 0) {
      let chosen = symbolPoints.find(p => p.localHour === 12)
      if (!chosen) chosen = symbolPoints.find(p => p.localHour === 11)
      if (!chosen) chosen = symbolPoints.find(p => p.localHour === 13)
      if (!chosen) chosen = symbolPoints[0]
      if (chosen) {
        const code = Math.round(chosen.value)
        symbol = { code, description: describeSymbol(code) }
      }
    }

    return {
      place: opts.place,
      date: opts.date,
      tempAt09,
      tempAt17,
      tempMax,
      tempMin,
      precipitationHours,
      maxWindMs,
      symbol,
    }
  } catch {
    return null
  }
}

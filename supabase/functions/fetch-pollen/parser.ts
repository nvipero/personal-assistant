const ALLERGEN_CODES = ['K', 'H', 'L', 'C', 'P', 'T'] as const
type AllergenCode = typeof ALLERGEN_CODES[number]

function parseLevels(codes: string): Partial<Record<AllergenCode, number>> {
  // "K, H" → { K: 1, H: 1 }
  // "KK, HHH" → { K: 2, H: 3 }
  const result: Partial<Record<AllergenCode, number>> = {}
  for (const token of codes.split(',').map(s => s.trim()).filter(Boolean)) {
    const match = token.match(/^([KHLCPT])\1{0,2}$/)
    if (match) {
      result[match[1] as AllergenCode] = token.length
    }
  }
  return result
}

function parseCityLine(block: string, city: string): Partial<Record<AllergenCode, number>> {
  const lines = block.split(/\r?\n/)
  const line = lines.find(l => l.startsWith(city))
  if (!line) return {}
  const codes = line.slice(city.length).trim()
  return parseLevels(codes)
}

function parseForecastRange(block: string): string {
  const match = block.match(/(\d{2}\.\d{2}\.\d{4})\s*-\s*(\d{2}\.\d{2}\.\d{4})/)
  return match ? `${match[1]} - ${match[2]}` : ''
}

function parseBulletinDate(text: string): string {
  // Päivämäärä on TILANNE-otsikon jälkeen omalla rivillä: "TILANNE\n27.05.2026"
  const match = text.match(/TILANNE\s*\r?\n\s*(\d{2})\.(\d{2})\.(\d{4})/)
  if (!match) throw new Error('bulletin_date not found')
  const [, dd, mm, yyyy] = match
  return `${yyyy}-${mm}-${dd}`
}

function parseForecastText(text: string): string {
  const tekstitSplit = text.split('(TEKSTIT)')
  if (tekstitSplit.length < 2) return ''
  const tekstit = tekstitSplit[1]
  const match = tekstit.match(/ENNUSTE\s*\r?\n([\s\S]+?)(?:\(END\)|$)/)
  return match ? match[1].trim() : ''
}

export function parseBulletin(rawText: string, city: string) {
  const [structuredPart] = rawText.split('(TEKSTIT)')

  const tilanneMatch = structuredPart.match(/TILANNE([\s\S]*?)ENNUSTE/)
  const ennusteMatch = structuredPart.match(/ENNUSTE([\s\S]*?)(?:Tunnukset|$)/)

  if (!tilanneMatch || !ennusteMatch) {
    throw new Error('Invalid bulletin format: TILANNE/ENNUSTE blocks not found')
  }

  const today = parseCityLine(tilanneMatch[1], city)
  const forecast = parseCityLine(ennusteMatch[1], city)
  const range = parseForecastRange(ennusteMatch[1])

  return {
    bulletinDate: parseBulletinDate(rawText),
    data: {
      helsinki: {
        today,
        forecast: { ...forecast, range },
      },
      forecast_text: parseForecastText(rawText),
    },
  }
}

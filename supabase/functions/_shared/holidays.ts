// Suomen juhlapyhät — kiinteät ja liikkuvat

function easterSunday(year: number): Date {
  // Gaussin pääsiäisalgoritmi
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return new Date(year, month - 1, day)
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

function fridayBefore(date: Date): Date {
  const d = new Date(date)
  d.setDate(d.getDate() - 2)
  return d
}

function thursdayAfter(date: Date, weeks: number): Date {
  return addDays(date, weeks * 7 + 4)
}

function sundayAfter(date: Date, weeks: number): Date {
  return addDays(date, weeks * 7 + 7)
}

function nearestSaturday(year: number, month: number, fromDay: number): Date {
  const d = new Date(year, month - 1, fromDay)
  while (d.getDay() !== 6) d.setDate(d.getDate() + 1)
  return d
}

function nearestFriday(year: number, month: number, fromDay: number): Date {
  const d = new Date(year, month - 1, fromDay)
  while (d.getDay() !== 5) d.setDate(d.getDate() + 1)
  return d
}

export function getSpecialDay(date: Date): string | null {
  const year = date.getFullYear()
  const month = date.getMonth() + 1
  const day = date.getDate()
  const key = `${month}-${day}`

  const fixed: Record<string, string> = {
    '1-1': 'Uudenvuodenpäivä',
    '1-6': 'Loppiainen',
    '5-1': 'Vappu',
    '6-6': 'Suomen lipun päivä',
    '12-6': 'Itsenäisyyspäivä',
    '12-24': 'Jouluaatto',
    '12-25': 'Joulupäivä',
    '12-26': 'Tapaninpäivä',
    '12-31': 'Uudenvuodenaatto',
  }

  if (fixed[key]) return fixed[key]

  // Vapun aatto
  if (month === 4 && day === 30) return 'Vapun aatto'

  const easter = easterSunday(year)
  const goodFriday = fridayBefore(easter)
  const ascension = thursdayAfter(easter, 5) // helatorstai = 39 pv pääsiäisen jälkeen
  const pentecost = sundayAfter(easter, 6) // helluntai = 49 pv pääsiäisen jälkeen

  const movable: Array<[Date, string]> = [
    [goodFriday, 'Pitkäperjantai'],
    [easter, 'Pääsiäinen'],
    [addDays(easter, 1), 'Toinen pääsiäispäivä'],
    [ascension, 'Helatorstai'],
    [pentecost, 'Helluntai'],
    [nearestSaturday(year, 6, 20), 'Juhannusaatto'],
    [addDays(nearestSaturday(year, 6, 20), 1), 'Juhannuspäivä'],
    [nearestFriday(year, 10, 31), 'Pyhäinpäivä'],
  ]

  for (const [d, name] of movable) {
    if (
      d.getFullYear() === year &&
      d.getMonth() + 1 === month &&
      d.getDate() === day
    ) {
      return name
    }
  }

  return null
}

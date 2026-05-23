import { format, parseISO } from 'date-fns'
import { fi } from 'date-fns/locale'

export function formatSummaryDate(dateStr: string): string {
  const date = parseISO(dateStr)
  return format(date, 'EEEE d.M.yyyy', { locale: fi })
}

export function formatShortDate(dateStr: string): string {
  const date = parseISO(dateStr)
  return format(date, 'd.M.yyyy', { locale: fi })
}

export function formatRelativeDate(dateStr: string): string {
  const date = parseISO(dateStr)
  return format(date, 'EEEE d.M.', { locale: fi })
}

export function formatTimestamp(timestampStr: string): string {
  const date = new Date(timestampStr)
  return format(date, 'H:mm', { locale: fi })
}

const USD_TO_EUR = 0.92

export function formatCostEur(usd: number): string {
  return `${(usd * USD_TO_EUR).toFixed(4)} €`
}

export function formatCostUsd(usd: number): string {
  return `$${usd.toFixed(4)}`
}

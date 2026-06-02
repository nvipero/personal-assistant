import { getCalendarList, getCalendarEvents } from '../google.ts'
import type { Connector, ConnectorContext, ConnectorOutput, ConnectorItem } from '../types.ts'
import { formatInTimeZone } from 'https://esm.sh/date-fns-tz@3'

function formatEventTime(dateTimeStr: string | undefined, dateStr: string | undefined, timezone: string): string {
  if (dateTimeStr) {
    return formatInTimeZone(new Date(dateTimeStr), timezone, 'H:mm')
  }
  if (dateStr) {
    return 'koko päivä'
  }
  return '?'
}

function toEventPromptText(event: import('../types.ts').CalendarEvent, timezone: string): string {
  const startStr = formatEventTime(event.start?.dateTime, event.start?.date, timezone)
  const endStr = formatEventTime(event.end?.dateTime, event.end?.date, timezone)
  const attendeeCount = event.attendees?.length ?? 0
  const locationPart = event.location ? ` — sijainti: ${event.location}` : ''
  const attendeePart = attendeeCount > 0 ? ` osallistujat: ${attendeeCount}` : ''

  return `- [id: ${event.id}] ${startStr}–${endStr} ${event.summary ?? '(ei otsikkoa)'} (kalenteri: ${event.calendarName ?? 'Tuntematon'})${attendeePart}${locationPart}`
}

export const googleCalendarConnector: Connector = {
  name: 'google_calendar',

  async isConfiguredFor(_userId: string): Promise<boolean> {
    return true
  },

  async fetch(ctx: ConnectorContext & { accessToken: string }): Promise<ConnectorOutput> {
    const dateStr = formatInTimeZone(ctx.date, ctx.timezone, 'yyyy-MM-dd')
    const tzOffset = formatInTimeZone(new Date(`${dateStr}T12:00:00Z`), ctx.timezone, 'xxx')
    const timeMin = `${dateStr}T00:00:00${tzOffset}`
    const timeMax = `${dateStr}T23:59:59${tzOffset}`

    const calendars = await getCalendarList((ctx as unknown as { accessToken: string }).accessToken)
    const allEvents = (
      await Promise.all(
        calendars.map(cal =>
          getCalendarEvents(
            (ctx as unknown as { accessToken: string }).accessToken,
            cal.id,
            cal.summary,
            timeMin,
            timeMax
          ).catch(() => [])
        )
      )
    ).flat()

    // Järjestä alkamisajan mukaan
    allEvents.sort((a, b) => {
      const aTime = a.start?.dateTime ?? a.start?.date ?? ''
      const bTime = b.start?.dateTime ?? b.start?.date ?? ''
      return aTime.localeCompare(bTime)
    })

    const items: ConnectorItem[] = allEvents.map(ev => ({
      id: ev.id,
      type: 'event',
      promptText: toEventPromptText(ev, ctx.timezone),
      meta: { summary: ev.summary, start: ev.start, end: ev.end },
    }))

    return { source: 'google_calendar', items }
  },
}

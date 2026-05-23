export interface CalendarEvent {
  id: string
  summary: string
  start: { dateTime?: string; date?: string; timeZone?: string }
  end: { dateTime?: string; date?: string; timeZone?: string }
  attendees?: Array<{ email: string; displayName?: string; responseStatus?: string }>
  location?: string
  description?: string
  htmlLink?: string
  calendarName?: string
}

export interface GmailMessage {
  id: string
  threadId: string
  from: string
  subject: string
  snippet: string
  date: string
  isUnread: boolean
  toUser: boolean
  ccUser: boolean
}

export interface ConnectorContext {
  userId: string
  timezone: string
  date: Date
  userEmail: string
}

export interface ConnectorItem {
  id: string
  type: 'event' | 'email'
  promptText: string
  meta?: Record<string, unknown>
}

export interface ConnectorOutput {
  source: string
  items: ConnectorItem[]
}

export interface Connector {
  name: string
  isConfiguredFor(userId: string): Promise<boolean>
  fetch(ctx: ConnectorContext): Promise<ConnectorOutput>
}

export interface SummaryContext {
  userFirstName: string
  userEmail: string
  date: Date
  timezone: string
  events: ConnectorItem[]
  emails: ConnectorItem[]
  specialDay?: string
}

export interface ParsedSummaryResponse {
  summaryText: string
  referencedEmailIds: string[]
  referencedEventIds: string[]
}

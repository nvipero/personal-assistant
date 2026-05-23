const GOOGLE_CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID')!
const GOOGLE_CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET')!

export async function refreshAccessToken(refreshToken: string): Promise<string> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Token-päivitys epäonnistui: ${res.status} ${body}`)
  }

  const json = await res.json() as { access_token: string; error?: string }
  if (json.error) throw new Error(`Google OAuth virhe: ${json.error}`)
  return json.access_token
}

export async function exchangeCodeForTokens(
  code: string,
  redirectUri: string
): Promise<{ accessToken: string; refreshToken: string; scope: string }> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      code,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Koodinvaihto epäonnistui: ${res.status} ${body}`)
  }

  const json = await res.json() as {
    access_token: string
    refresh_token?: string
    scope: string
    error?: string
  }
  if (json.error) throw new Error(`Google OAuth virhe: ${json.error}`)
  if (!json.refresh_token) throw new Error('Refresh tokenia ei saatu — varmista access_type=offline ja prompt=consent')

  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    scope: json.scope,
  }
}

export async function getCalendarList(accessToken: string): Promise<Array<{ id: string; summary: string }>> {
  const res = await fetch('https://www.googleapis.com/calendar/v3/users/me/calendarList', {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) throw new Error(`calendarList virhe: ${res.status}`)
  const json = await res.json() as { items?: Array<{ id: string; summary: string }> }
  return json.items ?? []
}

export async function getCalendarEvents(
  accessToken: string,
  calendarId: string,
  calendarName: string,
  timeMin: string,
  timeMax: string
): Promise<import('./types.ts').CalendarEvent[]> {
  const params = new URLSearchParams({
    timeMin,
    timeMax,
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: '50',
  })
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${params}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  )
  if (!res.ok) throw new Error(`Calendar events virhe: ${res.status}`)
  const json = await res.json() as { items?: import('./types.ts').CalendarEvent[] }
  return (json.items ?? []).map(ev => ({ ...ev, calendarName }))
}

export async function getGmailMessages(
  accessToken: string,
  userEmail: string
): Promise<import('./types.ts').GmailMessage[]> {
  // Hae lista viimeisen 24h Inbox-viesteistä
  const listRes = await fetch(
    'https://gmail.googleapis.com/gmail/v1/users/me/messages?q=in:inbox newer_than:1d&maxResults=50',
    { headers: { Authorization: `Bearer ${accessToken}` } }
  )
  if (!listRes.ok) throw new Error(`Gmail list virhe: ${listRes.status}`)
  const listJson = await listRes.json() as { messages?: Array<{ id: string }> }
  const messageIds = listJson.messages ?? []

  if (messageIds.length === 0) return []

  // Hae metadata rinnakkain (max 20 kerralla)
  const messages = await Promise.all(
    messageIds.slice(0, 20).map(({ id }) =>
      fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=To&metadataHeaders=Cc&metadataHeaders=Date`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      ).then(r => r.json() as Promise<{
        id: string
        snippet: string
        labelIds: string[]
        payload: { headers: Array<{ name: string; value: string }> }
      }>)
    )
  )

  return messages.map(msg => {
    const getHeader = (name: string) =>
      msg.payload.headers.find(h => h.name.toLowerCase() === name.toLowerCase())?.value ?? ''

    const from = getHeader('From')
    const subject = getHeader('Subject')
    const date = getHeader('Date')
    const to = getHeader('To')
    const cc = getHeader('Cc')
    const isUnread = msg.labelIds?.includes('UNREAD') ?? false
    const toUser = to.includes(userEmail)
    const ccUser = cc.includes(userEmail) && !toUser

    return {
      id: msg.id,
      threadId: msg.id,
      from,
      subject,
      snippet: msg.snippet ?? '',
      date,
      isUnread,
      toUser,
      ccUser,
    }
  })
}

export async function getUserInfo(accessToken: string): Promise<{ email: string; given_name?: string }> {
  const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) throw new Error(`userinfo virhe: ${res.status}`)
  return res.json() as Promise<{ email: string; given_name?: string }>
}

import { getGmailMessages } from '../google.ts'
import type { Connector, ConnectorContext, ConnectorOutput, ConnectorItem, GmailMessage } from '../types.ts'

function toEmailPromptText(msg: GmailMessage): string {
  const flags: string[] = []
  if (msg.isUnread) flags.push('LUKEMATTA')
  if (msg.toUser) flags.push('TO: käyttäjä')
  else if (msg.ccUser) flags.push('CC: käyttäjä')

  const flagStr = flags.length > 0 ? `, ${flags.join(', ')}` : ''
  const dateTime = msg.date ? new Date(msg.date).toLocaleTimeString('fi-FI', { hour: '2-digit', minute: '2-digit' }) : '?'

  return `- [id: ${msg.id}${flagStr}] ${dateTime} From: ${msg.from} | ${msg.subject} Snippet: "${msg.snippet}"`
}

export const gmailConnector: Connector = {
  name: 'gmail',

  async isConfiguredFor(_userId: string): Promise<boolean> {
    return true
  },

  async fetch(ctx: ConnectorContext & { accessToken: string; userEmail: string }): Promise<ConnectorOutput> {
    const messages = await getGmailMessages(
      (ctx as unknown as { accessToken: string }).accessToken,
      ctx.userEmail
    )

    // Järjestä: ensin lukemattomat, sitten aika (uusin ensin)
    messages.sort((a, b) => {
      if (a.isUnread !== b.isUnread) return a.isUnread ? -1 : 1
      return new Date(b.date).getTime() - new Date(a.date).getTime()
    })

    const items: ConnectorItem[] = messages.map(msg => ({
      id: msg.id,
      type: 'email',
      promptText: toEmailPromptText(msg),
      meta: { from: msg.from, subject: msg.subject, isUnread: msg.isUnread },
    }))

    return { source: 'gmail', items }
  },
}

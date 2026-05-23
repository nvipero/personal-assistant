import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

interface MemoryRow {
  category: string
  content: string
}

const CATEGORY_LABELS: Record<string, string> = {
  people: 'Henkilöt',
  preferences: 'Asetukset',
  context: 'Konteksti',
  feedback: 'Aiemmasta palautteesta opittua',
}

export async function fetchUserMemories(userId: string): Promise<MemoryRow[]> {
  const adminClient = createClient(supabaseUrl, serviceRoleKey)
  const { data, error } = await adminClient
    .from('user_memory')
    .select('category, content')
    .eq('user_id', userId)
    .eq('is_active', true)
    .limit(30)

  if (error) throw error
  return (data ?? []) as MemoryRow[]
}

export function formatMemoriesForPrompt(memories: MemoryRow[]): string {
  if (memories.length === 0) return ''

  const byCategory: Record<string, string[]> = {}
  for (const { category, content } of memories) {
    if (!byCategory[category]) byCategory[category] = []
    byCategory[category].push(content)
  }

  const sections: string[] = ['KÄYTTÄJÄKOHTAISIA MUISTIINPANOJA (huomioi nämä yhteenvedossa):']

  for (const [cat, items] of Object.entries(byCategory)) {
    const label = CATEGORY_LABELS[cat] ?? cat
    sections.push(`\n${label}:`)
    for (const item of items) {
      sections.push(`- ${item}`)
    }
  }

  return sections.join('\n')
}

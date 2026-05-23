import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { DailySummary } from '@/types/database'

export function useLatestSummary(userId: string | undefined) {
  return useQuery<DailySummary | null>({
    queryKey: ['latest-summary', userId],
    queryFn: async () => {
      if (!userId) return null
      const { data, error } = await supabase
        .from('daily_summaries')
        .select('*')
        .eq('user_id', userId)
        .order('summary_date', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (error) throw error
      return data
    },
    enabled: !!userId,
  })
}

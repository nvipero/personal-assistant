import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { DailySummary } from '@/types/database'

export function useSummaryHistory(userId: string | undefined) {
  return useQuery<DailySummary[]>({
    queryKey: ['summary-history', userId],
    queryFn: async () => {
      if (!userId) return []
      const { data, error } = await supabase
        .from('daily_summaries')
        .select('*')
        .eq('user_id', userId)
        .order('summary_date', { ascending: false })
        .limit(30)

      if (error) throw error
      return data ?? []
    },
    enabled: !!userId,
  })
}

export function useSummaryByDate(userId: string | undefined, date: string | undefined) {
  return useQuery<DailySummary | null>({
    queryKey: ['summary-by-date', userId, date],
    queryFn: async () => {
      if (!userId || !date) return null
      const { data, error } = await supabase
        .from('daily_summaries')
        .select('*')
        .eq('user_id', userId)
        .eq('summary_date', date)
        .maybeSingle()

      if (error) throw error
      return data
    },
    enabled: !!userId && !!date,
  })
}

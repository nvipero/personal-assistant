import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { calculateCostUsd } from '@/lib/pricing'
import { format, startOfMonth, endOfMonth, subMonths } from 'date-fns'

interface MonthStats {
  count: number
  inputTokens: number
  outputTokens: number
  costUsd: number
}

async function fetchMonthStats(
  userId: string,
  from: Date,
  to: Date
): Promise<MonthStats> {
  const { data, error } = await supabase
    .from('daily_summaries')
    .select('*')
    .eq('user_id', userId)
    .gte('summary_date', format(from, 'yyyy-MM-dd'))
    .lte('summary_date', format(to, 'yyyy-MM-dd'))

  if (error) throw error

  return (data ?? []).reduce<MonthStats>(
    (acc, row) => ({
      count: acc.count + 1,
      inputTokens: acc.inputTokens + (row.input_tokens as number),
      outputTokens: acc.outputTokens + (row.output_tokens as number),
      costUsd: acc.costUsd + calculateCostUsd(row.model as string, row.input_tokens as number, row.output_tokens as number),
    }),
    { count: 0, inputTokens: 0, outputTokens: 0, costUsd: 0 }
  )
}

export function useCostStats(userId: string | undefined) {
  return useQuery({
    queryKey: ['cost-stats', userId],
    queryFn: async () => {
      if (!userId) return null
      const now = new Date()
      const [thisMonth, lastMonth] = await Promise.all([
        fetchMonthStats(userId, startOfMonth(now), endOfMonth(now)),
        fetchMonthStats(userId, startOfMonth(subMonths(now, 1)), endOfMonth(subMonths(now, 1))),
      ])
      return { thisMonth, lastMonth }
    },
    enabled: !!userId,
  })
}

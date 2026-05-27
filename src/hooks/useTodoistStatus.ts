import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export function useTodoistStatus(userId: string | undefined) {
  return useQuery({
    queryKey: ['todoist-status', userId],
    queryFn: async () => {
      if (!userId) return null
      const { data } = await supabase
        .from('user_integrations')
        .select('connected_at, revoked_at')
        .eq('user_id', userId)
        .eq('provider', 'todoist')
        .maybeSingle()
      return data
    },
    enabled: !!userId,
  })
}

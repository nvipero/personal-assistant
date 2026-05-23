import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { UserSettings } from '@/types/database'

export function useUserSettings(userId: string | undefined) {
  return useQuery<UserSettings | null>({
    queryKey: ['user-settings', userId],
    queryFn: async () => {
      if (!userId) return null
      const { data, error } = await supabase
        .from('user_settings')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle()

      if (error) throw error
      return data
    },
    enabled: !!userId,
  })
}

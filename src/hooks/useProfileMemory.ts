import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { MemoryCategory } from '@/types/database'

const PROFILE_CATEGORIES: MemoryCategory[] = ['people', 'preferences', 'context']

export interface ProfileValues {
  people: string
  preferences: string
  context: string
}

export function useProfileMemory(userId: string | undefined) {
  return useQuery<ProfileValues>({
    queryKey: ['profile-memory', userId],
    queryFn: async () => {
      if (!userId) return { people: '', preferences: '', context: '' }

      const { data, error } = await supabase
        .from('user_memory')
        .select('category, content')
        .eq('user_id', userId)
        .eq('source', 'user_profile')
        .eq('is_active', true)
        .in('category', PROFILE_CATEGORIES)

      if (error) throw error

      const values: ProfileValues = { people: '', preferences: '', context: '' }
      for (const row of data ?? []) {
        values[row.category as keyof ProfileValues] = row.content
      }
      return values
    },
    enabled: !!userId,
  })
}

export function useSaveProfile(userId: string | undefined) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (values: ProfileValues) => {
      if (!userId) throw new Error('Ei käyttäjää')

      for (const cat of PROFILE_CATEGORIES) {
        const content = values[cat as keyof ProfileValues].trim()

        // Poista vanhat profile-muistit tässä kategoriassa
        await supabase
          .from('user_memory')
          .update({ is_active: false })
          .eq('user_id', userId)
          .eq('source', 'user_profile')
          .eq('category', cat)
          .eq('is_active', true)

        if (content) {
          await supabase.from('user_memory').insert({
            user_id: userId,
            category: cat,
            content,
            source: 'user_profile',
            is_active: true,
          })
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile-memory', userId] })
      queryClient.invalidateQueries({ queryKey: ['user-memory', userId] })
    },
  })
}

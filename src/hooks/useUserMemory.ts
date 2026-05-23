import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { UserMemory, MemoryCategory } from '@/types/database'

export function useUserMemory(userId: string | undefined) {
  return useQuery<UserMemory[]>({
    queryKey: ['user-memory', userId],
    queryFn: async () => {
      if (!userId) return []
      const { data, error } = await supabase
        .from('user_memory')
        .select('*')
        .eq('user_id', userId)
        .eq('is_active', true)
        .order('created_at', { ascending: true })

      if (error) throw error
      return data ?? []
    },
    enabled: !!userId,
  })
}

export function useAddMemory(userId: string | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      content: string
      category: MemoryCategory
      source?: 'manual_edit' | 'feedback'
    }) => {
      if (!userId) throw new Error('Ei käyttäjää')
      const { error } = await supabase.from('user_memory').insert({
        user_id: userId,
        content: input.content,
        category: input.category,
        source: input.source ?? 'manual_edit',
        is_active: true,
      })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-memory', userId] })
    },
  })
}

export function useUpdateMemory(userId: string | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: { id: string; content: string; category: MemoryCategory }) => {
      const { error } = await supabase
        .from('user_memory')
        .update({ content: input.content, category: input.category })
        .eq('id', input.id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-memory', userId] })
    },
  })
}

export function useDeleteMemory(userId: string | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('user_memory')
        .update({ is_active: false })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-memory', userId] })
    },
  })
}

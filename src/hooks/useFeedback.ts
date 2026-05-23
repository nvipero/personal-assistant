import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { callEdgeFunction } from '@/lib/api'
import type { FeedbackRating } from '@/types/database'

interface SubmitFeedbackInput {
  summaryId: string
  rating?: FeedbackRating
  comment?: string
}

interface FeedbackResult {
  feedbackId: string
  memorySuggestion: string | null
  memoryCategory: string | null
}

export function useSubmitFeedback(userId: string | undefined) {
  const queryClient = useQueryClient()

  return useMutation<FeedbackResult, Error, SubmitFeedbackInput>({
    mutationFn: async ({ summaryId, rating, comment }) => {
      if (!userId) throw new Error('Ei käyttäjää')

      // Tallenna palaute tietokantaan
      const { data: feedback, error } = await supabase
        .from('summary_feedback')
        .insert({
          summary_id: summaryId,
          user_id: userId,
          rating: rating ?? null,
          comment: comment ?? null,
        })
        .select('id')
        .single()

      if (error) throw error

      // Jos kommentti annettu, pyydä LLM:ltä muistiehdotus
      let memorySuggestion: string | null = null
      let memoryCategory: string | null = null

      if (comment) {
        try {
          const res = await callEdgeFunction<{
            memory_suggestion: string | null
            category?: string | null
          }>('feedback-to-memory', { feedback_id: feedback.id })
          memorySuggestion = res.memory_suggestion
          memoryCategory = res.category ?? null
        } catch {
          // Epäonnistunut muistiehdotus ei ole fataalinen
        }
      }

      return { feedbackId: feedback.id, memorySuggestion, memoryCategory }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['latest-summary'] })
    },
  })
}

export function useAcceptMemorySuggestion(userId: string | undefined) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: {
      feedbackId: string
      content: string
      category: string
      edited: boolean
    }) => {
      if (!userId) throw new Error('Ei käyttäjää')

      // Tallenna muisti
      const { data: memory, error: memError } = await supabase
        .from('user_memory')
        .insert({
          user_id: userId,
          content: input.content,
          category: input.category as 'people' | 'preferences' | 'context' | 'feedback',
          source: 'feedback',
          is_active: true,
        })
        .select('id')
        .single()

      if (memError) throw memError

      // Päivitä feedback-rivi
      await supabase
        .from('summary_feedback')
        .update({
          suggestion_status: input.edited ? 'edited' : 'accepted',
          resulting_memory_id: memory.id,
        })
        .eq('id', input.feedbackId)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-memory', userId] })
    },
  })
}

export function useRejectMemorySuggestion() {
  return useMutation({
    mutationFn: async (feedbackId: string) => {
      await supabase
        .from('summary_feedback')
        .update({ suggestion_status: 'rejected' })
        .eq('id', feedbackId)
    },
  })
}

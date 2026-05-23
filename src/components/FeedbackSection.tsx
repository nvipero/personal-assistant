import { useState } from 'react'
import { ThumbsUp, ThumbsDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { fi } from '@/i18n/fi'
import { useSubmitFeedback, useAcceptMemorySuggestion, useRejectMemorySuggestion } from '@/hooks/useFeedback'
import type { FeedbackRating } from '@/types/database'

interface Props {
  summaryId: string
  userId: string
}

export default function FeedbackSection({ summaryId, userId }: Props) {
  const [rating, setRating] = useState<FeedbackRating | null>(null)
  const [comment, setComment] = useState('')
  const [showComment, setShowComment] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [editedSuggestion, setEditedSuggestion] = useState<string | null>(null)

  const submitFeedback = useSubmitFeedback(userId)
  const acceptMemory = useAcceptMemorySuggestion(userId)
  const rejectMemory = useRejectMemorySuggestion()

  const memorySuggestion = submitFeedback.data?.memorySuggestion ?? null
  const memoryCategory = submitFeedback.data?.memoryCategory ?? 'context'
  const feedbackId = submitFeedback.data?.feedbackId ?? null

  function handleRating(r: FeedbackRating) {
    setRating(r)
    setShowComment(true)
  }

  function handleSubmit() {
    submitFeedback.mutate(
      { summaryId, rating: rating ?? undefined, comment: comment || undefined },
      { onSuccess: () => setSubmitted(true) }
    )
  }

  function handleAcceptMemory(edited: boolean) {
    if (!feedbackId) return
    acceptMemory.mutate({
      feedbackId,
      content: editedSuggestion ?? memorySuggestion!,
      category: memoryCategory!,
      edited,
    })
  }

  function handleDismiss() {
    if (!feedbackId) return
    rejectMemory.mutate(feedbackId)
  }

  if (acceptMemory.isSuccess || rejectMemory.isSuccess) return null

  if (memorySuggestion && feedbackId) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">{fi.feedback.memorySuggestionTitle}</CardTitle>
          <CardDescription className="text-xs">
            {fi.feedback.memorySuggestionDescription}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            value={editedSuggestion ?? memorySuggestion}
            onChange={(e) => setEditedSuggestion(e.target.value)}
            rows={3}
            className="text-sm"
          />
          <div className="flex gap-2 flex-wrap">
            <Button
              size="sm"
              onClick={() => handleAcceptMemory(editedSuggestion !== null && editedSuggestion !== memorySuggestion)}
              disabled={acceptMemory.isPending}
            >
              {fi.feedback.addToMemory}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handleDismiss}
              disabled={rejectMemory.isPending}
            >
              {fi.feedback.dismiss}
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (submitted) {
    return (
      <p className="text-sm text-muted-foreground text-center">{fi.feedback.submitted}</p>
    )
  }

  return (
    <div className="space-y-3">
      {!showComment ? (
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground flex-1">
            {fi.feedback.addComment}
          </span>
          <Button
            size="sm"
            variant="outline"
            onClick={() => handleRating('thumbs_up')}
            className="gap-1"
          >
            <ThumbsUp className="h-3.5 w-3.5" />
            {fi.feedback.thumbsUp}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => handleRating('thumbs_down')}
            className="gap-1"
          >
            <ThumbsDown className="h-3.5 w-3.5" />
            {fi.feedback.thumbsDown}
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {rating === 'thumbs_up' ? (
              <ThumbsUp className="h-3.5 w-3.5" />
            ) : (
              <ThumbsDown className="h-3.5 w-3.5" />
            )}
            <span>{rating === 'thumbs_up' ? fi.feedback.thumbsUp : fi.feedback.thumbsDown}</span>
          </div>
          <Textarea
            placeholder={fi.feedback.commentPlaceholder}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={3}
            className="text-sm"
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={handleSubmit}
              disabled={submitFeedback.isPending}
            >
              {submitFeedback.isPending ? fi.feedback.submitting : fi.feedback.submit}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => { setShowComment(false); setRating(null) }}
              disabled={submitFeedback.isPending}
            >
              Peruuta
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

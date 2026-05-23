import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import NavBar from '@/components/NavBar'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { fi } from '@/i18n/fi'
import { useSummaryByDate } from '@/hooks/useSummaryHistory'
import { useUserStore } from '@/stores/userStore'
import { formatSummaryDate, formatTimestamp } from '@/lib/format'

export default function SummaryDetailPage() {
  const { date } = useParams<{ date: string }>()
  const navigate = useNavigate()
  const { user } = useUserStore()
  const { data: summary, isLoading } = useSummaryByDate(user?.id, date)

  return (
    <div className="min-h-screen bg-background pb-20">
      <header className="border-b px-4 py-4 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-lg font-semibold">
          {summary ? formatSummaryDate(summary.summary_date) : 'Yhteenveto'}
        </h1>
      </header>

      <main className="px-4 py-6 max-w-2xl mx-auto space-y-4">
        {isLoading ? (
          <div className="text-muted-foreground text-sm">Ladataan...</div>
        ) : summary ? (
          <>
            <div className="text-sm text-muted-foreground">
              {fi.home.generatedAt} {formatTimestamp(summary.generated_at)}
            </div>
            <Card>
              <CardContent className="pt-6">
                <p className="whitespace-pre-wrap leading-relaxed text-sm">
                  {summary.summary_text}
                </p>
              </CardContent>
            </Card>
          </>
        ) : (
          <p className="text-muted-foreground text-sm">Yhteenvetoa ei löydy.</p>
        )}
      </main>

      <NavBar />
    </div>
  )
}

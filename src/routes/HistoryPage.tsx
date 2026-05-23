import { Link } from 'react-router-dom'
import NavBar from '@/components/NavBar'
import { Card, CardContent } from '@/components/ui/card'
import { fi } from '@/i18n/fi'
import { useSummaryHistory } from '@/hooks/useSummaryHistory'
import { useUserStore } from '@/stores/userStore'
import { formatRelativeDate } from '@/lib/format'

export default function HistoryPage() {
  const { user } = useUserStore()
  const { data: summaries, isLoading } = useSummaryHistory(user?.id)

  return (
    <div className="min-h-screen bg-background pb-20">
      <header className="border-b px-4 py-4">
        <h1 className="text-lg font-semibold">{fi.history.title}</h1>
      </header>

      <main className="px-4 py-6 max-w-2xl mx-auto space-y-3">
        {isLoading ? (
          <div className="text-muted-foreground text-sm">Ladataan...</div>
        ) : !summaries?.length ? (
          <p className="text-muted-foreground text-sm">{fi.history.noHistory}</p>
        ) : (
          summaries.map((summary) => (
            <Link key={summary.id} to={`/summary/${summary.summary_date}`}>
              <Card className="hover:bg-accent/50 transition-colors cursor-pointer">
                <CardContent className="pt-4 pb-4">
                  <div className="font-medium text-sm capitalize">
                    {formatRelativeDate(summary.summary_date)}
                  </div>
                  <div className="text-muted-foreground text-xs mt-1 line-clamp-2">
                    {summary.summary_text}
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))
        )}
      </main>

      <NavBar />
    </div>
  )
}

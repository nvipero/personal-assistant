import { Link } from 'react-router-dom'
import NavBar from '@/components/NavBar'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { fi } from '@/i18n/fi'
import { useLatestSummary } from '@/hooks/useLatestSummary'
import { useUserStore } from '@/stores/userStore'
import { formatSummaryDate, formatTimestamp } from '@/lib/format'

export default function HomePage() {
  const { user } = useUserStore()
  const { data: summary, isLoading } = useLatestSummary(user?.id)

  return (
    <div className="min-h-screen bg-background pb-20">
      <header className="border-b px-4 py-4">
        <h1 className="text-lg font-semibold">{fi.app.name}</h1>
      </header>

      <main className="px-4 py-6 max-w-2xl mx-auto space-y-4">
        {isLoading ? (
          <div className="text-muted-foreground text-sm">Ladataan...</div>
        ) : summary ? (
          <>
            <div className="text-sm text-muted-foreground">
              {formatSummaryDate(summary.summary_date)} &middot;{' '}
              {fi.home.generatedAt} {formatTimestamp(summary.generated_at)}
            </div>
            <Card>
              <CardContent className="pt-6">
                <p className="whitespace-pre-wrap leading-relaxed text-sm">{summary.summary_text}</p>
              </CardContent>
            </Card>
          </>
        ) : (
          <Card>
            <CardContent className="pt-6 space-y-3">
              <p className="text-sm text-muted-foreground">{fi.home.noSummaryDescription}</p>
              <Button asChild variant="outline" size="sm">
                <Link to="/connect-google">{fi.home.connectGoogleCta}</Link>
              </Button>
            </CardContent>
          </Card>
        )}
      </main>

      <NavBar />
    </div>
  )
}

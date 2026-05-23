import { Link } from 'react-router-dom'
import NavBar from '@/components/NavBar'
import FeedbackSection from '@/components/FeedbackSection'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { fi } from '@/i18n/fi'
import { useLatestSummary } from '@/hooks/useLatestSummary'
import { useUserSettings } from '@/hooks/useUserSettings'
import { useUserStore } from '@/stores/userStore'
import { formatSummaryDate, formatTimestamp } from '@/lib/format'
import { isPushSupported, isRunningAsStandalone } from '@/lib/pushNotifications'

export default function HomePage() {
  const { user } = useUserStore()
  const { data: summary, isLoading } = useLatestSummary(user?.id)
  const { data: settings } = useUserSettings(user?.id)

  const googleConnected = !!settings?.google_email
  const pushEnabledInSettings = settings?.push_enabled ?? false
  const showPushCta = isPushSupported() && isRunningAsStandalone() && !pushEnabledInSettings

  return (
    <div className="min-h-screen bg-background pb-20">
      <header className="border-b px-4 py-4">
        <h1 className="text-lg font-semibold">{fi.app.name}</h1>
      </header>

      <main className="px-4 py-6 max-w-2xl mx-auto space-y-4">
        {/* CTA: Google ei yhdistetty */}
        {!isLoading && !googleConnected && (
          <Card>
            <CardContent className="pt-4 pb-4 flex items-center justify-between gap-4">
              <p className="text-sm text-muted-foreground">{fi.home.noSummaryDescription}</p>
              <Button asChild variant="outline" size="sm" className="shrink-0">
                <Link to="/connect-google">{fi.home.connectGoogleCta}</Link>
              </Button>
            </CardContent>
          </Card>
        )}

        {/* CTA: Push ei käytössä (vain standalone-tilassa) */}
        {!isLoading && showPushCta && (
          <Card>
            <CardContent className="pt-4 pb-4 flex items-center justify-between gap-4">
              <p className="text-sm text-muted-foreground">
                Ota push-notifikaatiot käyttöön asetuksista.
              </p>
              <Button asChild variant="outline" size="sm" className="shrink-0">
                <Link to="/settings">{fi.home.enablePushCta}</Link>
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Yhteenveto */}
        {isLoading ? (
          <div className="text-muted-foreground text-sm">Ladataan...</div>
        ) : summary ? (
          <>
            <div className="text-sm text-muted-foreground">
              {formatSummaryDate(summary.summary_date)} &middot;{' '}
              {fi.home.generatedAt} {formatTimestamp(summary.generated_at)}
            </div>
            <Card>
              <CardContent className="pt-6 pb-4 space-y-4">
                <p className="whitespace-pre-wrap leading-relaxed text-sm">{summary.summary_text}</p>
                {user && (
                  <FeedbackSection summaryId={summary.id} userId={user.id} />
                )}
              </CardContent>
            </Card>
          </>
        ) : googleConnected ? (
          <p className="text-sm text-muted-foreground">
            Tänään ei ole vielä yhteenvetoa. Se generoidaan automaattisesti aamuaikaan.
          </p>
        ) : null}
      </main>

      <NavBar />
    </div>
  )
}

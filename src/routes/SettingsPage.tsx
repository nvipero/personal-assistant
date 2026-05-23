import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle, AlertCircle } from 'lucide-react'
import NavBar from '@/components/NavBar'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { fi } from '@/i18n/fi'
import { useUserStore } from '@/stores/userStore'
import { useUserSettings } from '@/hooks/useUserSettings'
import { callEdgeFunction } from '@/lib/api'
import { supabase } from '@/lib/supabase'
import {
  isPushSupported,
  isRunningAsStandalone,
  subscribeToPush,
  unsubscribeFromPush,
  getCurrentSubscription,
} from '@/lib/pushNotifications'

const SUMMARY_TIMES = Object.keys(fi.summaryTime) as Array<keyof typeof fi.summaryTime>

export default function SettingsPage() {
  const { user } = useUserStore()
  const { data: settings, refetch } = useUserSettings(user?.id)
  const [generating, setGenerating] = useState(false)
  const [pushActive, setPushActive] = useState(false)
  const [pushLoading, setPushLoading] = useState(false)
  const [pushError, setPushError] = useState<string | null>(null)

  useEffect(() => {
    getCurrentSubscription().then((sub) => setPushActive(!!sub))
  }, [])

  async function handleGenerateNow() {
    if (!user) return
    setGenerating(true)
    try {
      await callEdgeFunction('manual-generate-summary', { user_id: user.id })
    } catch (err) {
      console.error('Yhteenvedon generointi epäonnistui:', err)
    } finally {
      setGenerating(false)
    }
  }

  async function handleTimeChange(time: string) {
    if (!user) return
    await supabase
      .from('user_settings')
      .upsert({ user_id: user.id, summary_time: time })
    refetch()
  }

  async function handlePushToggle(enable: boolean) {
    setPushLoading(true)
    setPushError(null)
    try {
      if (enable) {
        await subscribeToPush()
        setPushActive(true)
        await supabase
          .from('user_settings')
          .upsert({ user_id: user!.id, push_enabled: true })
      } else {
        await unsubscribeFromPush()
        setPushActive(false)
        await supabase
          .from('user_settings')
          .upsert({ user_id: user!.id, push_enabled: false })
      }
      refetch()
    } catch (err) {
      setPushError(err instanceof Error ? err.message : fi.errors.pushSubscriptionFailed)
    } finally {
      setPushLoading(false)
    }
  }

  async function handleSignOut() {
    await supabase.auth.signOut()
  }

  const googleConnected = !!settings?.google_email
  const showIosHint = isPushSupported() && !isRunningAsStandalone()

  return (
    <div className="min-h-screen bg-background pb-20">
      <header className="border-b px-4 py-4">
        <h1 className="text-lg font-semibold">{fi.settings.title}</h1>
      </header>

      <main className="px-4 py-6 max-w-2xl mx-auto space-y-6">
        {/* Aamuyhteenvedon asetukset */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{fi.settings.summarySettings}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>{fi.settings.summaryTime}</Label>
              <Select
                value={settings?.summary_time ?? '07:00'}
                onValueChange={handleTimeChange}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SUMMARY_TIMES.map((time) => (
                    <SelectItem key={time} value={time}>
                      {fi.summaryTime[time]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              variant="outline"
              onClick={handleGenerateNow}
              disabled={generating}
              className="w-full"
            >
              {generating ? fi.settings.generating : fi.settings.generateNow}
            </Button>
          </CardContent>
        </Card>

        <Separator />

        {/* Yhteydet */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{fi.settings.connections}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2 min-w-0">
                {googleConnected ? (
                  <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />
                ) : (
                  <AlertCircle className="h-4 w-4 text-muted-foreground shrink-0" />
                )}
                <div className="min-w-0">
                  <div className="text-sm font-medium">Google</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {googleConnected
                      ? fi.settings.googleConnected(settings!.google_email!)
                      : fi.settings.googleNotConnected}
                  </div>
                </div>
              </div>
              <Button asChild variant="outline" size="sm" className="shrink-0">
                <Link to="/connect-google">
                  {googleConnected ? fi.settings.reconnectGoogle : fi.settings.connectGoogle}
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>

        <Separator />

        {/* Push-notifikaatiot */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{fi.settings.pushNotifications}</CardTitle>
            {showIosHint && (
              <CardDescription className="text-xs">
                {fi.settings.pushIosHint}
              </CardDescription>
            )}
          </CardHeader>
          <CardContent className="space-y-3">
            {isPushSupported() ? (
              <div className="flex items-center justify-between">
                <Label htmlFor="push-toggle" className="text-sm cursor-pointer">
                  {pushActive ? fi.settings.pushEnabled : fi.settings.pushDisabled}
                </Label>
                <Switch
                  id="push-toggle"
                  checked={pushActive}
                  disabled={pushLoading}
                  onCheckedChange={handlePushToggle}
                />
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Selaimesi ei tue push-notifikaatioita.
              </p>
            )}
            {pushError && (
              <p className="text-xs text-destructive">{pushError}</p>
            )}
          </CardContent>
        </Card>

        <Separator />

        {/* Tili */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{fi.settings.account}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xs text-muted-foreground mb-3">{user?.email}</div>
            <Button variant="outline" onClick={handleSignOut} className="w-full">
              {fi.settings.signOut}
            </Button>
          </CardContent>
        </Card>
      </main>

      <NavBar />
    </div>
  )
}

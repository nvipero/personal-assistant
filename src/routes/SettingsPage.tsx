import { useState } from 'react'
import { Link } from 'react-router-dom'
import NavBar from '@/components/NavBar'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { fi } from '@/i18n/fi'
import { useUserStore } from '@/stores/userStore'
import { useUserSettings } from '@/hooks/useUserSettings'
import { callEdgeFunction } from '@/lib/api'
import { supabase } from '@/lib/supabase'

const SUMMARY_TIMES = Object.keys(fi.summaryTime) as Array<keyof typeof fi.summaryTime>

export default function SettingsPage() {
  const { user } = useUserStore()
  const { data: settings, refetch } = useUserSettings(user?.id)
  const [generating, setGenerating] = useState(false)

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

  async function handleSignOut() {
    await supabase.auth.signOut()
  }

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
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium">Google</div>
                <div className="text-xs text-muted-foreground">
                  {fi.settings.googleNotConnected}
                </div>
              </div>
              <Button asChild variant="outline" size="sm">
                <Link to="/connect-google">{fi.settings.connectGoogle}</Link>
              </Button>
            </div>
          </CardContent>
        </Card>

        <Separator />

        {/* Tili */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{fi.settings.account}</CardTitle>
          </CardHeader>
          <CardContent>
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

import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { CheckCircle, AlertCircle, Pencil, Trash2, Plus } from 'lucide-react'
import NavBar from '@/components/NavBar'
import MemoryDialog from '@/components/MemoryDialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Separator } from '@/components/ui/separator'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { fi } from '@/i18n/fi'
import { useUserStore } from '@/stores/userStore'
import { useUserSettings } from '@/hooks/useUserSettings'
import { useUserMemory, useAddMemory, useUpdateMemory, useDeleteMemory } from '@/hooks/useUserMemory'
import { useProfileMemory, useSaveProfile } from '@/hooks/useProfileMemory'
import { useCostStats } from '@/hooks/useCostStats'
import { callEdgeFunction } from '@/lib/api'
import { formatCostEur } from '@/lib/format'
import { supabase } from '@/lib/supabase'
import {
  isPushSupported,
  isRunningAsStandalone,
  subscribeToPush,
  unsubscribeFromPush,
  getCurrentSubscription,
} from '@/lib/pushNotifications'
import type { UserMemory } from '@/types/database'

type EditableCategory = 'people' | 'preferences' | 'context'

const SUMMARY_TIMES = Object.keys(fi.summaryTime) as Array<keyof typeof fi.summaryTime>
const MAX_MEMORIES = 30

export default function SettingsPage() {
  const { user } = useUserStore()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { data: settings, refetch: refetchSettings } = useUserSettings(user?.id)
  const { data: memories } = useUserMemory(user?.id)
  const { data: profile } = useProfileMemory(user?.id)
  const { data: costStats } = useCostStats(user?.id)

  const addMemory = useAddMemory(user?.id)
  const updateMemory = useUpdateMemory(user?.id)
  const deleteMemory = useDeleteMemory(user?.id)
  const saveProfile = useSaveProfile(user?.id)

  const [generating, setGenerating] = useState(false)
  const [timeSaved, setTimeSaved] = useState(false)
  const [pushActive, setPushActive] = useState(false)
  const [pushLoading, setPushLoading] = useState(false)
  const [pushError, setPushError] = useState<string | null>(null)

  const [memoryDialogOpen, setMemoryDialogOpen] = useState(false)
  const [editingMemory, setEditingMemory] = useState<UserMemory | null>(null)
  const [deletingMemory, setDeletingMemory] = useState<UserMemory | null>(null)

  const [profileValues, setProfileValues] = useState({ people: '', preferences: '', context: '' })
  const [profileSaved, setProfileSaved] = useState(false)

  useEffect(() => {
    getCurrentSubscription().then((sub) => setPushActive(!!sub))
  }, [])

  useEffect(() => {
    if (profile) setProfileValues(profile)
  }, [profile])

  async function handleGenerateNow() {
    if (!user) return
    setGenerating(true)
    try {
      await callEdgeFunction('manual-generate-summary', { user_id: user.id })
      await queryClient.invalidateQueries({ queryKey: ['latest-summary'] })
      navigate('/')
    } catch (err) {
      console.error('Yhteenvedon generointi epäonnistui:', err)
      setGenerating(false)
    }
  }

  async function handleTimeChange(time: string) {
    if (!user) return
    const { error } = await supabase
      .from('user_settings')
      .update({ summary_time: time })
      .eq('user_id', user.id)
    if (!error) {
      setTimeSaved(true)
      setTimeout(() => setTimeSaved(false), 2000)
      refetchSettings()
    } else {
      console.error('Aikavalinta ei tallentunut:', error)
    }
  }

  async function handleWeatherToggle(enable: boolean) {
    if (!user) return
    await supabase
      .from('user_settings')
      .update({ weather_enabled: enable })
      .eq('user_id', user.id)
    refetchSettings()
  }

  async function handlePushToggle(enable: boolean) {
    setPushLoading(true)
    setPushError(null)
    try {
      if (enable) {
        await subscribeToPush()
        setPushActive(true)
        await supabase.from('user_settings').upsert({ user_id: user!.id, push_enabled: true })
      } else {
        await unsubscribeFromPush()
        setPushActive(false)
        await supabase.from('user_settings').upsert({ user_id: user!.id, push_enabled: false })
      }
      refetchSettings()
    } catch (err) {
      setPushError(err instanceof Error ? err.message : fi.errors.pushSubscriptionFailed)
    } finally {
      setPushLoading(false)
    }
  }

  async function handleSignOut() {
    await supabase.auth.signOut()
  }

  function handleMemorySave(content: string, category: EditableCategory) {
    if (editingMemory) {
      updateMemory.mutate(
        { id: editingMemory.id, content, category },
        { onSuccess: () => { setMemoryDialogOpen(false); setEditingMemory(null) } }
      )
    } else {
      addMemory.mutate(
        { content, category, source: 'manual_edit' },
        { onSuccess: () => setMemoryDialogOpen(false) }
      )
    }
  }

  function handleProfileSave() {
    saveProfile.mutate(profileValues, {
      onSuccess: () => {
        setProfileSaved(true)
        setTimeout(() => setProfileSaved(false), 2000)
      },
    })
  }

  const googleConnected = !!settings?.google_email
  const showIosHint = isPushSupported() && !isRunningAsStandalone()
  const memoryCount = memories?.length ?? 0
  const atMemoryLimit = memoryCount >= MAX_MEMORIES

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
                value={(settings?.summary_time ?? '07:00').slice(0, 5)}
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
              {timeSaved && <p className="text-xs text-green-600">{fi.settings.saved}</p>}
            </div>
            <Button
              variant="outline"
              onClick={handleGenerateNow}
              disabled={generating}
              className="w-full"
            >
              {generating ? fi.settings.generating : fi.settings.generateNow}
            </Button>
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="weather-toggle" className="text-sm cursor-pointer">
                  {fi.settings.weatherEnabled}
                </Label>
                <p className="text-xs text-muted-foreground">{fi.settings.weatherEnabledDescription}</p>
              </div>
              <Switch
                id="weather-toggle"
                checked={settings?.weather_enabled ?? true}
                onCheckedChange={handleWeatherToggle}
              />
            </div>
          </CardContent>
        </Card>

        <Separator />

        {/* Tunne minut — profiili */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{fi.settings.knowMe}</CardTitle>
            <CardDescription className="text-xs">{fi.settings.knowMeDescription}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label className="text-xs font-medium">{fi.settings.profilePeople}</Label>
              <Textarea
                placeholder={fi.settings.profilePeoplePlaceholder}
                value={profileValues.people}
                onChange={(e) => setProfileValues((v) => ({ ...v, people: e.target.value }))}
                rows={3}
                className="text-sm"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-medium">{fi.settings.profilePreferences}</Label>
              <Textarea
                placeholder={fi.settings.profilePreferencesPlaceholder}
                value={profileValues.preferences}
                onChange={(e) => setProfileValues((v) => ({ ...v, preferences: e.target.value }))}
                rows={3}
                className="text-sm"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-medium">{fi.settings.profileContext}</Label>
              <Textarea
                placeholder={fi.settings.profileContextPlaceholder}
                value={profileValues.context}
                onChange={(e) => setProfileValues((v) => ({ ...v, context: e.target.value }))}
                rows={3}
                className="text-sm"
              />
            </div>
            <Button
              onClick={handleProfileSave}
              disabled={saveProfile.isPending}
              className="w-full"
            >
              {profileSaved
                ? fi.settings.saved
                : saveProfile.isPending
                  ? fi.settings.saving
                  : fi.settings.saveProfile}
            </Button>
          </CardContent>
        </Card>

        <Separator />

        {/* Muistilista */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">{fi.settings.memories}</CardTitle>
              <Button
                size="sm"
                variant="outline"
                onClick={() => { setEditingMemory(null); setMemoryDialogOpen(true) }}
                disabled={atMemoryLimit}
                className="gap-1"
              >
                <Plus className="h-3.5 w-3.5" />
                {fi.settings.addMemory}
              </Button>
            </div>
            <CardDescription className="text-xs">
              {fi.settings.memoriesCount(memoryCount)}
              {atMemoryLimit && (
                <span className="text-destructive ml-1">{fi.settings.memoriesWarning}</span>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!memories?.length ? (
              <p className="text-sm text-muted-foreground">Ei muisteja vielä.</p>
            ) : (
              <div className="space-y-2">
                {memories.map((mem) => (
                  <div
                    key={mem.id}
                    className="flex items-start gap-2 rounded-md border p-3"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="secondary" className="text-xs shrink-0">
                          {fi.settings.memoryCategories[mem.category as keyof typeof fi.settings.memoryCategories]}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground break-words">{mem.content}</p>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        onClick={() => { setEditingMemory(mem); setMemoryDialogOpen(true) }}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={() => setDeletingMemory(mem)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Separator />

        {/* Yhteydet */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{fi.settings.connections}</CardTitle>
          </CardHeader>
          <CardContent>
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
              <CardDescription className="text-xs">{fi.settings.pushIosHint}</CardDescription>
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
            {pushError && <p className="text-xs text-destructive">{pushError}</p>}
          </CardContent>
        </Card>

        <Separator />

        {/* Kustannukset */}
        {costStats && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{fi.settings.costs}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {[
                { label: fi.settings.costsThisMonth, stats: costStats.thisMonth },
                { label: fi.settings.costsLastMonth, stats: costStats.lastMonth },
              ].map(({ label, stats }) => (
                <div key={label}>
                  <div className="text-xs font-medium text-muted-foreground mb-2">{label}</div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                    <span className="text-muted-foreground">{fi.settings.summaries}</span>
                    <span className="text-right">{stats.count}</span>
                    <span className="text-muted-foreground">{fi.settings.inputTokens}</span>
                    <span className="text-right">{stats.inputTokens.toLocaleString('fi')}</span>
                    <span className="text-muted-foreground">{fi.settings.outputTokens}</span>
                    <span className="text-right">{stats.outputTokens.toLocaleString('fi')}</span>
                    <span className="text-muted-foreground">{fi.settings.estimatedCost}</span>
                    <span className="text-right font-medium">{formatCostEur(stats.costUsd)}</span>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

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

      <MemoryDialog
        open={memoryDialogOpen}
        onClose={() => { setMemoryDialogOpen(false); setEditingMemory(null) }}
        onSave={handleMemorySave}
        saving={addMemory.isPending || updateMemory.isPending}
        initialValues={editingMemory ?? undefined}
      />

      <Dialog open={!!deletingMemory} onOpenChange={(open) => { if (!open) setDeletingMemory(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Poistetaanko muisti?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">{deletingMemory?.content}</p>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDeletingMemory(null)}>Peruuta</Button>
            <Button
              variant="destructive"
              disabled={deleteMemory.isPending}
              onClick={() => {
                if (deletingMemory) {
                  deleteMemory.mutate(deletingMemory.id, { onSuccess: () => setDeletingMemory(null) })
                }
              }}
            >
              Poista
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <NavBar />
    </div>
  )
}

import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft, CheckCircle, XCircle } from 'lucide-react'
import NavBar from '@/components/NavBar'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { fi } from '@/i18n/fi'
import { callEdgeFunction } from '@/lib/api'

type Status = 'idle' | 'loading' | 'success' | 'error'

function getTodoistRedirectUri(): string {
  return `${window.location.origin}/connect-todoist/callback`
}

export default function ConnectTodoistPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [status, setStatus] = useState<Status>('idle')
  const [errorMessage, setErrorMessage] = useState('')

  const code = searchParams.get('code')
  const state = searchParams.get('state')
  const callbackUsed = useRef(false)

  useEffect(() => {
    if (!code || !state || callbackUsed.current) return
    callbackUsed.current = true

    setStatus('loading')
    callEdgeFunction<{ ok: boolean; error?: string }>(
      'todoist-oauth-callback',
      { code, state, redirect_uri: getTodoistRedirectUri() }
    )
      .then((res) => {
        if (res.ok) {
          setStatus('success')
        } else {
          setErrorMessage(res.error ?? fi.todoist.connectError)
          setStatus('error')
        }
      })
      .catch((err: unknown) => {
        setErrorMessage(err instanceof Error ? err.message : fi.todoist.connectError)
        setStatus('error')
      })
  }, [code, state])

  async function handleConnect() {
    setStatus('loading')
    try {
      const res = await callEdgeFunction<{ ok: boolean; redirectUrl?: string; error?: string }>(
        'todoist-oauth-start',
        { redirect_uri: getTodoistRedirectUri() }
      )
      if (res.ok && res.redirectUrl) {
        window.location.href = res.redirectUrl
      } else {
        setErrorMessage(res.error ?? fi.todoist.connectError)
        setStatus('error')
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : fi.todoist.connectError)
      setStatus('error')
    }
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      <header className="border-b px-4 py-4 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-lg font-semibold">{fi.todoist.connectTitle}</h1>
      </header>

      <main className="px-4 py-6 max-w-2xl mx-auto">
        {status === 'success' ? (
          <Card>
            <CardContent className="pt-6 flex flex-col items-center gap-4 text-center">
              <CheckCircle className="h-12 w-12 text-green-500" />
              <div>
                <p className="font-medium">{fi.todoist.connectSuccess}</p>
              </div>
              <Button onClick={() => navigate('/settings')}>Siirry asetuksiin</Button>
            </CardContent>
          </Card>
        ) : status === 'error' ? (
          <Card>
            <CardContent className="pt-6 flex flex-col items-center gap-4 text-center">
              <XCircle className="h-12 w-12 text-destructive" />
              <p className="text-sm text-muted-foreground">{errorMessage}</p>
              <Button variant="outline" onClick={() => setStatus('idle')}>
                Yritä uudelleen
              </Button>
            </CardContent>
          </Card>
        ) : status === 'loading' ? (
          <div className="text-center text-muted-foreground">{fi.todoist.connecting}</div>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>{fi.todoist.connectTitle}</CardTitle>
              <CardDescription>{fi.todoist.connectDescription}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Button onClick={handleConnect} className="w-full">
                {fi.todoist.connectButton}
              </Button>
            </CardContent>
          </Card>
        )}
      </main>

      <NavBar />
    </div>
  )
}

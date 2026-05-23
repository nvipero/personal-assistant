import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft, CheckCircle, XCircle } from 'lucide-react'
import NavBar from '@/components/NavBar'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { fi } from '@/i18n/fi'
import { callEdgeFunction } from '@/lib/api'
import { getGoogleOAuthUrl, getGoogleRedirectUri } from '@/lib/googleOauth'

type Status = 'idle' | 'loading' | 'success' | 'error'

export default function ConnectGooglePage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [status, setStatus] = useState<Status>('idle')
  const [errorMessage, setErrorMessage] = useState('')
  const [connectedEmail, setConnectedEmail] = useState('')

  const code = searchParams.get('code')
  const codeUsed = useRef(false)

  useEffect(() => {
    if (!code || codeUsed.current) return
    codeUsed.current = true

    setStatus('loading')
    callEdgeFunction<{ ok: boolean; google_email?: string; error?: string }>(
      'google-oauth-handler',
      { code, redirect_uri: getGoogleRedirectUri() }
    )
      .then((res) => {
        if (res.ok && res.google_email) {
          setConnectedEmail(res.google_email)
          setStatus('success')
        } else {
          setErrorMessage(res.error ?? fi.google.connectError)
          setStatus('error')
        }
      })
      .catch((err: unknown) => {
        setErrorMessage(err instanceof Error ? err.message : fi.google.connectError)
        setStatus('error')
      })
  }, [code])

  function handleConnect() {
    try {
      const url = getGoogleOAuthUrl(getGoogleRedirectUri())
      window.location.href = url
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : fi.google.connectError)
      setStatus('error')
    }
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      <header className="border-b px-4 py-4 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-lg font-semibold">{fi.google.connectTitle}</h1>
      </header>

      <main className="px-4 py-6 max-w-2xl mx-auto">
        {status === 'success' ? (
          <Card>
            <CardContent className="pt-6 flex flex-col items-center gap-4 text-center">
              <CheckCircle className="h-12 w-12 text-green-500" />
              <div>
                <p className="font-medium">{fi.google.connectSuccess}</p>
                <p className="text-sm text-muted-foreground mt-1">{connectedEmail}</p>
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
          <div className="text-center text-muted-foreground">Yhdistetään...</div>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>{fi.google.connectTitle}</CardTitle>
              <CardDescription>{fi.google.connectDescription}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <ul className="text-sm text-muted-foreground space-y-1">
                {fi.google.scopes.map((scope) => (
                  <li key={scope} className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />
                    {scope}
                  </li>
                ))}
              </ul>
              <Button onClick={handleConnect} className="w-full">
                {fi.google.connectButton}
              </Button>
            </CardContent>
          </Card>
        )}
      </main>

      <NavBar />
    </div>
  )
}

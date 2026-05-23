import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useUserStore } from '@/stores/userStore'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { fi } from '@/i18n/fi'

export default function LoginPage() {
  const navigate = useNavigate()
  const { user, isLoading } = useUserStore()
  const [signingIn, setSigningIn] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isLoading && user) {
      navigate('/', { replace: true })
    }
  }, [user, isLoading, navigate])

  async function handleGoogleSignIn() {
    setSigningIn(true)
    setError(null)
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        queryParams: {
          access_type: 'online',
          prompt: 'select_account',
        },
      },
    })
    if (error) {
      setError(error.message)
      setSigningIn(false)
    }
    // Onnistuminen ohjaa automaattisesti Googleen — ei palata tähän
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-muted-foreground text-sm">Ladataan...</div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4 bg-background">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center space-y-1">
          <CardTitle className="text-2xl">{fi.app.name}</CardTitle>
          <CardDescription>{fi.auth.signInDescription}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button
            onClick={handleGoogleSignIn}
            disabled={signingIn}
            className="w-full"
            size="lg"
          >
            {signingIn ? fi.auth.signingIn : fi.auth.signInWithGoogle}
          </Button>
          {error && (
            <p className="text-destructive text-sm text-center">{error}</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

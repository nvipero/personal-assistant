import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'

export default function AuthCallbackPage() {
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const handleCallback = async () => {
      // Supabase käsittelee URL:n hash/query parametrit automaattisesti
      // onAuthStateChange-eventin kautta — odotetaan sessiota
      const { data: { session }, error: sessionError } = await supabase.auth.getSession()

      if (sessionError) {
        setError(sessionError.message)
        return
      }

      if (session) {
        navigate('/', { replace: true })
        return
      }

      // Jos sessio ei heti valmiina, kuunnellaan auth state changea
      const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_IN' && session) {
          subscription.unsubscribe()
          navigate('/', { replace: true })
        } else if (event === 'SIGNED_OUT') {
          subscription.unsubscribe()
          navigate('/login', { replace: true })
        }
      })

      // Timeout: jos 10 sekunnissa ei kirjaudu, ohjataan loginiin
      const timeout = setTimeout(() => {
        subscription.unsubscribe()
        navigate('/login', { replace: true })
      }, 10000)

      return () => {
        clearTimeout(timeout)
        subscription.unsubscribe()
      }
    }

    void handleCallback()
  }, [navigate])

  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4">
        <p className="text-destructive text-sm">{error}</p>
        <button
          className="text-primary underline text-sm"
          onClick={() => navigate('/login', { replace: true })}
        >
          Palaa kirjautumiseen
        </button>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-muted-foreground text-sm">Kirjaudutaan...</div>
    </div>
  )
}

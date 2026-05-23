import { Link, useLocation } from 'react-router-dom'
import { Home, Clock, Settings } from 'lucide-react'
import { cn } from '@/lib/utils'
import { fi } from '@/i18n/fi'

const navItems = [
  { to: '/', label: fi.nav.home, icon: Home },
  { to: '/history', label: fi.nav.history, icon: Clock },
  { to: '/settings', label: fi.nav.settings, icon: Settings },
]

export default function NavBar() {
  const location = useLocation()

  return (
    <nav className="fixed bottom-0 left-0 right-0 border-t bg-background z-40">
      <div className="flex">
        {navItems.map(({ to, label, icon: Icon }) => {
          const isActive = to === '/' ? location.pathname === '/' : location.pathname.startsWith(to)
          return (
            <Link
              key={to}
              to={to}
              className={cn(
                'flex flex-1 flex-col items-center gap-1 py-3 text-xs transition-colors',
                isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <Icon className="h-5 w-5" />
              <span>{label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}

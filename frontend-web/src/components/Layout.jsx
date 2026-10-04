import { useState } from 'react'
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom'
import { 
  LayoutDashboard,
  Palette,
  Users,
  Code2, 
  CreditCard, 
  ArrowLeftRight, 
  Send, 
  Shield, 
  Settings, 
  LogOut,
  Menu,
  X,
  Bell,
  User
} from 'lucide-react'
import { Button } from '@/components/ui/button.jsx'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar.jsx'
import { Badge } from '@/components/ui/badge.jsx'
import { useAuth } from '../contexts/AuthContext'
import { ThemeToggle } from '@/components/ui/ThemeToggle.jsx'

const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Accounts', href: '/accounts', icon: CreditCard },
  { name: 'Transactions', href: '/transactions', icon: ArrowLeftRight },
  { name: 'Transfer', href: '/transfer', icon: Send },
  { name: 'KYC Verification', href: '/kyc', icon: Shield },
  { name: 'Settings', href: '/settings', icon: Settings },
  { name: 'Design System', href: '/design-system', icon: Palette },
  { name: 'Segments & Apps', href: '/admin/segments', icon: Users },
  { name: 'Developer Portal', href: '/developers', icon: Code2 },
]

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const location = useLocation()
  const navigate = useNavigate()
  const { user, logout } = useAuth()

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <div className="min-h-screen bg-[var(--nb-surface-secondary)]">
      {/* Mobile sidebar */}
      <div className={`fixed inset-0 z-50 lg:hidden ${sidebarOpen ? 'block' : 'hidden'}`}>
        <div className="fixed inset-0 bg-[var(--nb-surface-overlay)]" onClick={() => setSidebarOpen(false)} />
        <div className="fixed inset-y-0 left-0 flex w-64 flex-col bg-[var(--nb-surface-primary)] shadow-xl">
          <div className="flex h-16 items-center justify-between px-6 bg-[var(--nb-action-primary)]">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="h-8 w-8 bg-[var(--nb-surface-primary)] rounded-[var(--nb-radius-xs)] flex items-center justify-center">
                  <span className="text-[var(--nb-action-primary)] font-bold text-lg">N</span>
                </div>
              </div>
              <span className="ml-3 text-white font-semibold text-lg">NeoBank</span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSidebarOpen(false)}
              className="text-[var(--nb-text-on-action)] hover:bg-[var(--nb-action-hover)]"
            >
              <X className="h-5 w-5" />
            </Button>
          </div>
          <nav className="flex-1 px-4 py-6 space-y-2">
            {navigation.map((item) => {
              const Icon = item.icon
              const isActive = location.pathname === item.href
              return (
                <Link
                  key={item.name}
                  to={item.href}
                  onClick={() => setSidebarOpen(false)}
                  className={`group flex items-center px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                    isActive
                      ? 'bg-[var(--nb-brand-50)] text-[var(--nb-brand-700)] border-r-2 border-[var(--nb-brand-700)]'
                      : 'text-[var(--nb-text-secondary)] hover:bg-[var(--nb-surface-tertiary)] hover:text-[var(--nb-text-primary)]'
                  }`}
                >
                  <Icon className={`mr-3 h-5 w-5 ${isActive ? 'text-[var(--nb-brand-700)]' : 'text-[var(--nb-text-disabled)] group-hover:text-[var(--nb-text-secondary)]'}`} />
                  {item.name}
                </Link>
              )
            })}
          </nav>
        </div>
      </div>

      {/* Desktop sidebar */}
      <div className="hidden lg:fixed lg:inset-y-0 lg:flex lg:w-64 lg:flex-col">
        <div className="flex flex-col flex-grow bg-[var(--nb-surface-primary)] shadow-lg border-r border-[var(--nb-border-subtle)]">
          <div className="flex h-16 items-center px-6 bg-[var(--nb-action-primary)]">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="h-8 w-8 bg-[var(--nb-surface-primary)] rounded-[var(--nb-radius-xs)] flex items-center justify-center">
                  <span className="text-[var(--nb-action-primary)] font-bold text-lg">N</span>
                </div>
              </div>
              <span className="ml-3 text-white font-semibold text-lg">NeoBank</span>
            </div>
          </div>
          <nav className="flex-1 px-4 py-6 space-y-2">
            {navigation.map((item) => {
              const Icon = item.icon
              const isActive = location.pathname === item.href
              return (
                <Link
                  key={item.name}
                  to={item.href}
                  className={`group flex items-center px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                    isActive
                      ? 'bg-[var(--nb-brand-50)] text-[var(--nb-brand-700)] border-r-2 border-[var(--nb-brand-700)]'
                      : 'text-[var(--nb-text-secondary)] hover:bg-[var(--nb-surface-tertiary)] hover:text-[var(--nb-text-primary)]'
                  }`}
                >
                  <Icon className={`mr-3 h-5 w-5 ${isActive ? 'text-[var(--nb-brand-700)]' : 'text-[var(--nb-text-disabled)] group-hover:text-[var(--nb-text-secondary)]'}`} />
                  {item.name}
                </Link>
              )
            })}
          </nav>
        </div>
      </div>

      {/* Main content */}
      <div className="lg:pl-64">
        {/* Top bar */}
        <div className="sticky top-0 z-40 bg-[var(--nb-surface-primary)] shadow-sm border-b border-[var(--nb-border-subtle)]">
          <div className="flex h-16 items-center justify-between px-4 sm:px-6 lg:px-8">
            <div className="flex items-center">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSidebarOpen(true)}
                className="lg:hidden"
              >
                <Menu className="h-5 w-5" />
              </Button>
              <h1 className="ml-4 text-lg font-semibold text-[var(--nb-text-primary)] lg:ml-0">
                {navigation.find(item => item.href === location.pathname)?.name || 'Dashboard'}
              </h1>
            </div>

            <div className="flex items-center space-x-4">
              <ThemeToggle />
              {/* Notifications */}
              <Button variant="ghost" size="sm" className="relative">
                <Bell className="h-5 w-5" />
                <Badge className="absolute -top-1 -right-1 h-4 w-4 p-0 text-xs bg-red-500">
                  3
                </Badge>
              </Button>

              {/* User menu */}
              <div className="flex items-center space-x-3">
                <Avatar className="h-8 w-8">
                  <AvatarImage src={user?.avatar} alt={user?.name} />
                  <AvatarFallback>
                    {user?.name?.split(' ').map(n => n[0]).join('') || 'U'}
                  </AvatarFallback>
                </Avatar>
                <div className="hidden md:block">
                  <p className="text-sm font-medium text-[var(--nb-text-primary)]">{user?.name || 'User'}</p>
                  <p className="text-xs text-[var(--nb-text-secondary)]">{user?.email}</p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleLogout}
                  className="text-[var(--nb-text-secondary)] hover:text-[var(--nb-text-primary)]"
                >
                  <LogOut className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Page content */}
        <main className="flex-1">
          <div className="p-4 sm:p-6 lg:p-8">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}

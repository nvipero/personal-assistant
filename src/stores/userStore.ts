import { create } from 'zustand'
import type { User } from '@supabase/supabase-js'
import type { UserSettings } from '@/types/database'

interface UserState {
  user: User | null
  settings: UserSettings | null
  isLoading: boolean
  setUser: (user: User | null) => void
  setSettings: (settings: UserSettings | null) => void
  setLoading: (loading: boolean) => void
}

export const useUserStore = create<UserState>((set) => ({
  user: null,
  settings: null,
  isLoading: true,
  setUser: (user) => set({ user }),
  setSettings: (settings) => set({ settings }),
  setLoading: (isLoading) => set({ isLoading }),
}))

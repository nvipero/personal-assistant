// Tämä tiedosto generoidaan Supabase CLI:llä:
// pnpm dlx supabase gen types typescript --linked > src/types/database.ts
// Alla käsin kirjoitettu versio jota käytetään ennen projektin linkitystä.

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export interface Database {
  public: {
    Tables: {
      user_settings: {
        Row: {
          user_id: string
          summary_time: string
          timezone: string
          push_enabled: boolean
          needs_google_reauth: boolean
          google_email: string | null
          weather_enabled: boolean
          weather_place: string
          created_at: string
          updated_at: string
        }
        Insert: {
          user_id: string
          summary_time?: string
          timezone?: string
          push_enabled?: boolean
          needs_google_reauth?: boolean
          google_email?: string | null
          weather_enabled?: boolean
          weather_place?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          summary_time?: string
          timezone?: string
          push_enabled?: boolean
          needs_google_reauth?: boolean
          google_email?: string | null
          weather_enabled?: boolean
          weather_place?: string
          updated_at?: string
        }
        Relationships: []
      }
      daily_summaries: {
        Row: {
          id: string
          user_id: string
          summary_date: string
          summary_text: string
          email_ids: string[]
          event_ids: string[]
          input_tokens: number
          output_tokens: number
          model: string
          generated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          summary_date: string
          summary_text: string
          email_ids?: string[]
          event_ids?: string[]
          input_tokens: number
          output_tokens: number
          model: string
          generated_at?: string
        }
        Update: {
          summary_text?: string
          email_ids?: string[]
          event_ids?: string[]
          input_tokens?: number
          output_tokens?: number
          model?: string
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          id: string
          user_id: string
          endpoint: string
          p256dh_key: string
          auth_key: string
          user_agent: string | null
          created_at: string
          last_used_at: string | null
        }
        Insert: {
          id?: string
          user_id: string
          endpoint: string
          p256dh_key: string
          auth_key: string
          user_agent?: string | null
          created_at?: string
          last_used_at?: string | null
        }
        Update: {
          last_used_at?: string | null
        }
        Relationships: []
      }
      user_memory: {
        Row: {
          id: string
          user_id: string
          category: 'people' | 'preferences' | 'context' | 'feedback'
          content: string
          source: 'user_profile' | 'feedback' | 'manual_edit'
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          category: 'people' | 'preferences' | 'context' | 'feedback'
          content: string
          source: 'user_profile' | 'feedback' | 'manual_edit'
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          category?: 'people' | 'preferences' | 'context' | 'feedback'
          content?: string
          source?: 'user_profile' | 'feedback' | 'manual_edit'
          is_active?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      summary_feedback: {
        Row: {
          id: string
          summary_id: string
          user_id: string
          rating: 'thumbs_up' | 'thumbs_down' | null
          comment: string | null
          generated_memory_suggestion: string | null
          suggestion_status: 'pending' | 'accepted' | 'rejected' | 'edited' | null
          resulting_memory_id: string | null
          created_at: string
        }
        Insert: {
          id?: string
          summary_id: string
          user_id: string
          rating?: 'thumbs_up' | 'thumbs_down' | null
          comment?: string | null
          generated_memory_suggestion?: string | null
          suggestion_status?: 'pending' | 'accepted' | 'rejected' | 'edited' | null
          resulting_memory_id?: string | null
          created_at?: string
        }
        Update: {
          rating?: 'thumbs_up' | 'thumbs_down' | null
          comment?: string | null
          generated_memory_suggestion?: string | null
          suggestion_status?: 'pending' | 'accepted' | 'rejected' | 'edited' | null
          resulting_memory_id?: string | null
        }
        Relationships: []
      }
      google_oauth_tokens: {
        Row: {
          user_id: string
          encrypted_refresh_token: string
          scopes: string[]
          google_email: string
          connected_at: string
          last_refreshed_at: string | null
        }
        Insert: {
          user_id: string
          encrypted_refresh_token: string
          scopes: string[]
          google_email: string
          connected_at?: string
          last_refreshed_at?: string | null
        }
        Update: {
          encrypted_refresh_token?: string
          scopes?: string[]
          google_email?: string
          last_refreshed_at?: string | null
        }
        Relationships: []
      }
      prompt_versions: {
        Row: {
          id: string
          name: string
          version: number
          content: string
          is_active: boolean
          notes: string | null
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          version: number
          content: string
          is_active?: boolean
          notes?: string | null
          created_at?: string
        }
        Update: {
          content?: string
          is_active?: boolean
          notes?: string | null
        }
        Relationships: []
      }
    }
    Views: {}
    Functions: {}
    Enums: {}
    CompositeTypes: {}
  }
}

// Kätevät tyypit suoraan taulujen riveistä
export type UserSettings = Database['public']['Tables']['user_settings']['Row']
export type DailySummary = Database['public']['Tables']['daily_summaries']['Row']
export type PushSubscription_ = Database['public']['Tables']['push_subscriptions']['Row']
export type UserMemory = Database['public']['Tables']['user_memory']['Row']
export type SummaryFeedback = Database['public']['Tables']['summary_feedback']['Row']
export type GoogleOAuthToken = Database['public']['Tables']['google_oauth_tokens']['Row']

export type MemoryCategory = UserMemory['category']
export type MemorySource = UserMemory['source']
export type FeedbackRating = NonNullable<SummaryFeedback['rating']>

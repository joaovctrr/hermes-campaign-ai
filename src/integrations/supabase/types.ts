export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      cron_run_logs: {
        Row: {
          error: string | null
          finished_at: string | null
          hook: string
          id: string
          started_at: string
          status: string
          users_processed: number
          users_skipped: number
          users_total: number
        }
        Insert: {
          error?: string | null
          finished_at?: string | null
          hook: string
          id?: string
          started_at?: string
          status?: string
          users_processed?: number
          users_skipped?: number
          users_total?: number
        }
        Update: {
          error?: string | null
          finished_at?: string | null
          hook?: string
          id?: string
          started_at?: string
          status?: string
          users_processed?: number
          users_skipped?: number
          users_total?: number
        }
        Relationships: []
      }
      cron_user_logs: {
        Row: {
          action: string
          created_at: string
          error: string | null
          hook: string
          id: string
          inserted_count: number | null
          interval_hours: number | null
          plan: string | null
          reason: string | null
          run_id: string
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string
          error?: string | null
          hook: string
          id?: string
          inserted_count?: number | null
          interval_hours?: number | null
          plan?: string | null
          reason?: string | null
          run_id: string
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string
          error?: string | null
          hook?: string
          id?: string
          inserted_count?: number | null
          interval_hours?: number | null
          plan?: string | null
          reason?: string | null
          run_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cron_user_logs_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "cron_run_logs"
            referencedColumns: ["id"]
          },
        ]
      }
      generated_posts: {
        Row: {
          content: string
          created_at: string
          format: string
          id: string
          news_item_id: string | null
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          format: string
          id?: string
          news_item_id?: string | null
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          format?: string
          id?: string
          news_item_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "generated_posts_news_item_id_fkey"
            columns: ["news_item_id"]
            isOneToOne: false
            referencedRelation: "news_items"
            referencedColumns: ["id"]
          },
        ]
      }
      insight_feedback: {
        Row: {
          context_window: string
          created_at: string
          id: string
          recommendation_hash: string
          recommendation_text: string
          useful: boolean
          user_id: string
        }
        Insert: {
          context_window: string
          created_at?: string
          id?: string
          recommendation_hash: string
          recommendation_text: string
          useful: boolean
          user_id: string
        }
        Update: {
          context_window?: string
          created_at?: string
          id?: string
          recommendation_hash?: string
          recommendation_text?: string
          useful?: boolean
          user_id?: string
        }
        Relationships: []
      }
      insight_history: {
        Row: {
          generated_at: string
          id: string
          negativo_pct: number
          neutro_pct: number
          positivo_pct: number
          recommendations: Json
          refresh_source: string
          sentiment_trend: string | null
          top_themes: Json
          total_mentions: number
          user_id: string
          window_kind: string
        }
        Insert: {
          generated_at?: string
          id?: string
          negativo_pct?: number
          neutro_pct?: number
          positivo_pct?: number
          recommendations?: Json
          refresh_source?: string
          sentiment_trend?: string | null
          top_themes?: Json
          total_mentions?: number
          user_id: string
          window_kind: string
        }
        Update: {
          generated_at?: string
          id?: string
          negativo_pct?: number
          neutro_pct?: number
          positivo_pct?: number
          recommendations?: Json
          refresh_source?: string
          sentiment_trend?: string | null
          top_themes?: Json
          total_mentions?: number
          user_id?: string
          window_kind?: string
        }
        Relationships: []
      }
      news_items: {
        Row: {
          created_at: string
          id: string
          published_at: string | null
          source: string | null
          summary: string | null
          theme: string | null
          title: string
          urgency: string
          url: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          published_at?: string | null
          source?: string | null
          summary?: string | null
          theme?: string | null
          title: string
          urgency?: string
          url?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          published_at?: string | null
          source?: string | null
          summary?: string | null
          theme?: string | null
          title?: string
          urgency?: string
          url?: string | null
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          bio: string | null
          created_at: string
          cron_interval_hours: number
          facebook_handle: string | null
          full_name: string | null
          id: string
          instagram_handle: string | null
          mention_keywords: string[] | null
          monitored_networks: string[]
          monitored_themes: string[] | null
          onboarded: boolean
          plan: string
          political_role: string | null
          region: string | null
          tiktok_handle: string | null
          tone: string | null
          twitter_handle: string | null
          updated_at: string
        }
        Insert: {
          bio?: string | null
          created_at?: string
          cron_interval_hours?: number
          facebook_handle?: string | null
          full_name?: string | null
          id: string
          instagram_handle?: string | null
          mention_keywords?: string[] | null
          monitored_networks?: string[]
          monitored_themes?: string[] | null
          onboarded?: boolean
          plan?: string
          political_role?: string | null
          region?: string | null
          tiktok_handle?: string | null
          tone?: string | null
          twitter_handle?: string | null
          updated_at?: string
        }
        Update: {
          bio?: string | null
          created_at?: string
          cron_interval_hours?: number
          facebook_handle?: string | null
          full_name?: string | null
          id?: string
          instagram_handle?: string | null
          mention_keywords?: string[] | null
          monitored_networks?: string[]
          monitored_themes?: string[] | null
          onboarded?: boolean
          plan?: string
          political_role?: string | null
          region?: string | null
          tiktok_handle?: string | null
          tone?: string | null
          twitter_handle?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      sentiment_snapshots: {
        Row: {
          created_at: string
          id: string
          negativo: number
          networks: Json
          neutro: number
          positivo: number
          top_topics: Json
          total: number
          user_id: string
          window_end: string
          window_start: string
        }
        Insert: {
          created_at?: string
          id?: string
          negativo?: number
          networks?: Json
          neutro?: number
          positivo?: number
          top_topics?: Json
          total?: number
          user_id: string
          window_end?: string
          window_start: string
        }
        Update: {
          created_at?: string
          id?: string
          negativo?: number
          networks?: Json
          neutro?: number
          positivo?: number
          top_topics?: Json
          total?: number
          user_id?: string
          window_end?: string
          window_start?: string
        }
        Relationships: []
      }
      social_mentions: {
        Row: {
          author: string | null
          collected_at: string
          content: string
          created_at: string
          external_id: string | null
          id: string
          network: string
          parent_post_caption: string | null
          parent_post_id: string | null
          parent_post_thumbnail: string | null
          parent_post_url: string | null
          posted_at: string | null
          score: number | null
          sentiment: string
          source_type: string
          url: string | null
          user_id: string
        }
        Insert: {
          author?: string | null
          collected_at?: string
          content: string
          created_at?: string
          external_id?: string | null
          id?: string
          network: string
          parent_post_caption?: string | null
          parent_post_id?: string | null
          parent_post_thumbnail?: string | null
          parent_post_url?: string | null
          posted_at?: string | null
          score?: number | null
          sentiment?: string
          source_type?: string
          url?: string | null
          user_id: string
        }
        Update: {
          author?: string | null
          collected_at?: string
          content?: string
          created_at?: string
          external_id?: string | null
          id?: string
          network?: string
          parent_post_caption?: string | null
          parent_post_id?: string | null
          parent_post_thumbnail?: string | null
          parent_post_url?: string | null
          posted_at?: string | null
          score?: number | null
          sentiment?: string
          source_type?: string
          url?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      dashboard_stats: {
        Row: {
          critical_24h: number | null
          last_24h: number | null
          last_news_at: string | null
          total: number | null
          user_id: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      get_my_cron_history: {
        Args: { _limit?: number }
        Returns: {
          action: string
          created_at: string
          error: string
          hook: string
          id: string
          inserted_count: number
          interval_hours: number
          plan: string
          reason: string
          run_id: string
          run_started_at: string
          run_status: string
        }[]
      }
      get_my_dashboard_stats: {
        Args: never
        Returns: {
          critical_24h: number
          last_24h: number
          last_news_at: string
          total: number
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      refresh_dashboard_stats: { Args: never; Returns: undefined }
    }
    Enums: {
      app_role: "admin" | "user"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "user"],
    },
  },
} as const

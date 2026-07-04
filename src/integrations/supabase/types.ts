export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      candidate_actions: {
        Row: {
          action_date: string | null;
          action_type: string;
          created_at: string;
          description: string | null;
          id: string;
          keywords: string[];
          legislature: string | null;
          source: string | null;
          source_url: string | null;
          theme: string | null;
          title: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          action_date?: string | null;
          action_type: string;
          created_at?: string;
          description?: string | null;
          id?: string;
          keywords?: string[];
          legislature?: string | null;
          source?: string | null;
          source_url?: string | null;
          theme?: string | null;
          title: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          action_date?: string | null;
          action_type?: string;
          created_at?: string;
          description?: string | null;
          id?: string;
          keywords?: string[];
          legislature?: string | null;
          source?: string | null;
          source_url?: string | null;
          theme?: string | null;
          title?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      candidate_keywords: {
        Row: {
          active: boolean;
          created_at: string;
          id: string;
          keyword: string;
          keyword_type: string;
          theme: string | null;
          user_id: string;
          weight: number;
        };
        Insert: {
          active?: boolean;
          created_at?: string;
          id?: string;
          keyword: string;
          keyword_type?: string;
          theme?: string | null;
          user_id: string;
          weight?: number;
        };
        Update: {
          active?: boolean;
          created_at?: string;
          id?: string;
          keyword?: string;
          keyword_type?: string;
          theme?: string | null;
          user_id?: string;
          weight?: number;
        };
        Relationships: [];
      };
      cities: {
        Row: {
          created_at: string;
          ibge_id: number | null;
          id: string;
          name: string;
          state_id: string | null;
          uf: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          ibge_id?: number | null;
          id?: string;
          name: string;
          state_id?: string | null;
          uf: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          ibge_id?: number | null;
          id?: string;
          name?: string;
          state_id?: string | null;
          uf?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      cron_run_logs: {
        Row: {
          error: string | null;
          finished_at: string | null;
          hook: string;
          id: string;
          started_at: string;
          status: string;
          users_processed: number;
          users_skipped: number;
          users_total: number;
        };
        Insert: {
          error?: string | null;
          finished_at?: string | null;
          hook: string;
          id?: string;
          started_at?: string;
          status?: string;
          users_processed?: number;
          users_skipped?: number;
          users_total?: number;
        };
        Update: {
          error?: string | null;
          finished_at?: string | null;
          hook?: string;
          id?: string;
          started_at?: string;
          status?: string;
          users_processed?: number;
          users_skipped?: number;
          users_total?: number;
        };
        Relationships: [];
      };
      cron_user_logs: {
        Row: {
          action: string;
          created_at: string;
          error: string | null;
          hook: string;
          id: string;
          inserted_count: number | null;
          interval_hours: number | null;
          plan: string | null;
          reason: string | null;
          run_id: string;
          user_id: string;
        };
        Insert: {
          action: string;
          created_at?: string;
          error?: string | null;
          hook: string;
          id?: string;
          inserted_count?: number | null;
          interval_hours?: number | null;
          plan?: string | null;
          reason?: string | null;
          run_id: string;
          user_id: string;
        };
        Update: {
          action?: string;
          created_at?: string;
          error?: string | null;
          hook?: string;
          id?: string;
          inserted_count?: number | null;
          interval_hours?: number | null;
          plan?: string | null;
          reason?: string | null;
          run_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "cron_user_logs_run_id_fkey";
            columns: ["run_id"];
            isOneToOne: false;
            referencedRelation: "cron_run_logs";
            referencedColumns: ["id"];
          },
        ];
      };
      generated_posts: {
        Row: {
          content: string;
          created_at: string;
          format: string;
          id: string;
          news_item_id: string | null;
          user_id: string;
        };
        Insert: {
          content: string;
          created_at?: string;
          format: string;
          id?: string;
          news_item_id?: string | null;
          user_id: string;
        };
        Update: {
          content?: string;
          created_at?: string;
          format?: string;
          id?: string;
          news_item_id?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "generated_posts_news_item_id_fkey";
            columns: ["news_item_id"];
            isOneToOne: false;
            referencedRelation: "news_items";
            referencedColumns: ["id"];
          },
        ];
      };
      insight_feedback: {
        Row: {
          context_window: string;
          created_at: string;
          id: string;
          recommendation_hash: string;
          recommendation_text: string;
          useful: boolean;
          user_id: string;
        };
        Insert: {
          context_window: string;
          created_at?: string;
          id?: string;
          recommendation_hash: string;
          recommendation_text: string;
          useful: boolean;
          user_id: string;
        };
        Update: {
          context_window?: string;
          created_at?: string;
          id?: string;
          recommendation_hash?: string;
          recommendation_text?: string;
          useful?: boolean;
          user_id?: string;
        };
        Relationships: [];
      };
      insight_history: {
        Row: {
          generated_at: string;
          id: string;
          negativo_pct: number;
          neutro_pct: number;
          positivo_pct: number;
          recommendations: Json;
          refresh_source: string;
          sentiment_trend: string | null;
          top_themes: Json;
          total_mentions: number;
          user_id: string;
          window_kind: string;
        };
        Insert: {
          generated_at?: string;
          id?: string;
          negativo_pct?: number;
          neutro_pct?: number;
          positivo_pct?: number;
          recommendations?: Json;
          refresh_source?: string;
          sentiment_trend?: string | null;
          top_themes?: Json;
          total_mentions?: number;
          user_id: string;
          window_kind: string;
        };
        Update: {
          generated_at?: string;
          id?: string;
          negativo_pct?: number;
          neutro_pct?: number;
          positivo_pct?: number;
          recommendations?: Json;
          refresh_source?: string;
          sentiment_trend?: string | null;
          top_themes?: Json;
          total_mentions?: number;
          user_id?: string;
          window_kind?: string;
        };
        Relationships: [];
      };
      intelligence_alerts: {
        Row: {
          alert_type: string;
          created_at: string;
          description: string | null;
          id: string;
          is_resolved: boolean;
          related_url: string | null;
          resolved_at: string | null;
          source: string | null;
          title: string;
          urgency: string;
          user_id: string;
        };
        Insert: {
          alert_type?: string;
          created_at?: string;
          description?: string | null;
          id?: string;
          is_resolved?: boolean;
          related_url?: string | null;
          resolved_at?: string | null;
          source?: string | null;
          title: string;
          urgency?: string;
          user_id: string;
        };
        Update: {
          alert_type?: string;
          created_at?: string;
          description?: string | null;
          id?: string;
          is_resolved?: boolean;
          related_url?: string | null;
          resolved_at?: string | null;
          source?: string | null;
          title?: string;
          urgency?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      legislative_document_chunks: {
        Row: {
          chunk_index: number;
          content: string;
          created_at: string;
          document_id: string;
          id: string;
          user_id: string;
        };
        Insert: {
          chunk_index: number;
          content: string;
          created_at?: string;
          document_id: string;
          id?: string;
          user_id: string;
        };
        Update: {
          chunk_index?: number;
          content?: string;
          created_at?: string;
          document_id?: string;
          id?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      legislative_documents: {
        Row: {
          chunk_count: number;
          created_at: string;
          error: string | null;
          extracted_text: string | null;
          file_name: string;
          id: string;
          mime_type: string | null;
          size_bytes: number | null;
          status: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          chunk_count?: number;
          created_at?: string;
          error?: string | null;
          extracted_text?: string | null;
          file_name: string;
          id?: string;
          mime_type?: string | null;
          size_bytes?: number | null;
          status?: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          chunk_count?: number;
          created_at?: string;
          error?: string | null;
          extracted_text?: string | null;
          file_name?: string;
          id?: string;
          mime_type?: string | null;
          size_bytes?: number | null;
          status?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      legislative_memory_chunks: {
        Row: {
          action_id: string | null;
          content: string;
          created_at: string;
          document_id: string | null;
          embedding: string | null;
          id: string;
          metadata: Json;
          source_type: string;
          title: string;
          user_id: string;
        };
        Insert: {
          action_id?: string | null;
          content: string;
          created_at?: string;
          document_id?: string | null;
          embedding?: string | null;
          id?: string;
          metadata?: Json;
          source_type: string;
          title: string;
          user_id: string;
        };
        Update: {
          action_id?: string | null;
          content?: string;
          created_at?: string;
          document_id?: string | null;
          embedding?: string | null;
          id?: string;
          metadata?: Json;
          source_type?: string;
          title?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      mentions: {
        Row: {
          city: string | null;
          collected_at: string;
          content_snippet: string | null;
          created_at: string;
          full_content: string | null;
          id: string;
          is_archived: boolean;
          is_false_positive: boolean;
          is_read: boolean;
          mention_type: string;
          opportunity_score: number;
          published_at: string | null;
          relevance_score: number;
          risk_score: number;
          sentiment: string;
          source_name: string | null;
          source_type: string;
          source_url: string | null;
          state: string | null;
          theme: string | null;
          title: string;
          urgency: string;
          user_id: string;
        };
        Insert: {
          city?: string | null;
          collected_at?: string;
          content_snippet?: string | null;
          created_at?: string;
          full_content?: string | null;
          id?: string;
          is_archived?: boolean;
          is_false_positive?: boolean;
          is_read?: boolean;
          mention_type?: string;
          opportunity_score?: number;
          published_at?: string | null;
          relevance_score?: number;
          risk_score?: number;
          sentiment?: string;
          source_name?: string | null;
          source_type?: string;
          source_url?: string | null;
          state?: string | null;
          theme?: string | null;
          title: string;
          urgency?: string;
          user_id: string;
        };
        Update: {
          city?: string | null;
          collected_at?: string;
          content_snippet?: string | null;
          created_at?: string;
          full_content?: string | null;
          id?: string;
          is_archived?: boolean;
          is_false_positive?: boolean;
          is_read?: boolean;
          mention_type?: string;
          opportunity_score?: number;
          published_at?: string | null;
          relevance_score?: number;
          risk_score?: number;
          sentiment?: string;
          source_name?: string | null;
          source_type?: string;
          source_url?: string | null;
          state?: string | null;
          theme?: string | null;
          title?: string;
          urgency?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      monitored_sources: {
        Row: {
          active: boolean;
          city: string | null;
          created_at: string;
          id: string;
          last_checked_at: string | null;
          name: string;
          notes: string | null;
          priority_level: string;
          source_type: string;
          state: string | null;
          theme: string | null;
          updated_at: string;
          url: string;
          user_id: string;
        };
        Insert: {
          active?: boolean;
          city?: string | null;
          created_at?: string;
          id?: string;
          last_checked_at?: string | null;
          name: string;
          notes?: string | null;
          priority_level?: string;
          source_type?: string;
          state?: string | null;
          theme?: string | null;
          updated_at?: string;
          url: string;
          user_id: string;
        };
        Update: {
          active?: boolean;
          city?: string | null;
          created_at?: string;
          id?: string;
          last_checked_at?: string | null;
          name?: string;
          notes?: string | null;
          priority_level?: string;
          source_type?: string;
          state?: string | null;
          theme?: string | null;
          updated_at?: string;
          url?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      news_items: {
        Row: {
          author: string | null;
          created_at: string;
          geography: string | null;
          id: string;
          neighborhood: string | null;
          published_at: string | null;
          relevance_score: number;
          sentiment: string | null;
          source: string | null;
          state: string | null;
          summary: string | null;
          theme: string | null;
          title: string;
          urgency: string;
          url: string | null;
          user_id: string;
        };
        Insert: {
          author?: string | null;
          created_at?: string;
          geography?: string | null;
          id?: string;
          neighborhood?: string | null;
          published_at?: string | null;
          relevance_score?: number;
          sentiment?: string | null;
          source?: string | null;
          state?: string | null;
          summary?: string | null;
          theme?: string | null;
          title: string;
          urgency?: string;
          url?: string | null;
          user_id: string;
        };
        Update: {
          author?: string | null;
          created_at?: string;
          geography?: string | null;
          id?: string;
          neighborhood?: string | null;
          published_at?: string | null;
          relevance_score?: number;
          sentiment?: string | null;
          source?: string | null;
          state?: string | null;
          summary?: string | null;
          theme?: string | null;
          title?: string;
          urgency?: string;
          url?: string | null;
          user_id?: string;
        };
        Relationships: [];
      };
      news_briefings: {
        Row: {
          candidate_connection: string | null;
          cautions: string[];
          connection_level: string | null;
          created_at: string;
          id: string;
          news_item_id: string;
          next_step: string | null;
          relevance_score: number;
          suggested_angles: string[];
          telegram_sent_at: string | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          candidate_connection?: string | null;
          cautions?: string[];
          connection_level?: string | null;
          created_at?: string;
          id?: string;
          news_item_id: string;
          next_step?: string | null;
          relevance_score?: number;
          suggested_angles?: string[];
          telegram_sent_at?: string | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          candidate_connection?: string | null;
          cautions?: string[];
          connection_level?: string | null;
          created_at?: string;
          id?: string;
          news_item_id?: string;
          next_step?: string | null;
          relevance_score?: number;
          suggested_angles?: string[];
          telegram_sent_at?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          avatar_url: string | null;
          bio: string | null;
          created_at: string;
          cron_interval_hours: number;
          electoral_number: string | null;
          facebook_handle: string | null;
          full_name: string | null;
          has_payment_method: boolean;
          id: string;
          intelligence_enabled: boolean;
          instagram_handle: string | null;
          manual_refresh_enabled: boolean;
          max_users: number;
          mention_keywords: string[] | null;
          monitored_cities: string[];
          monitored_networks: string[];
          monitored_states: string[];
          monitored_themes: string[] | null;
          monthly_post_limit: number | null;
          onboarded: boolean;
          party: string | null;
          plan: string;
          political_name: string | null;
          preferred_news_neighborhood: string | null;
          preferred_news_state: string | null;
          priority_audience: string | null;
          priority_cities: string[];
          political_role: string | null;
          positioning_phrase: string | null;
          radar_interval_hours: number;
          realtime_alerts_enabled: boolean;
          region: string | null;
          sentiment_enabled: boolean;
          subscription_status: string;
          target_position: string | null;
          tiktok_handle: string | null;
          tone: string | null;
          trial_ends_at: string | null;
          twitter_handle: string | null;
          upload_file_limit: number | null;
          updated_at: string;
        };
        Insert: {
          avatar_url?: string | null;
          bio?: string | null;
          created_at?: string;
          cron_interval_hours?: number;
          electoral_number?: string | null;
          facebook_handle?: string | null;
          full_name?: string | null;
          has_payment_method?: boolean;
          id: string;
          intelligence_enabled?: boolean;
          instagram_handle?: string | null;
          manual_refresh_enabled?: boolean;
          max_users?: number;
          mention_keywords?: string[] | null;
          monitored_cities?: string[];
          monitored_networks?: string[];
          monitored_states?: string[];
          monitored_themes?: string[] | null;
          monthly_post_limit?: number | null;
          onboarded?: boolean;
          party?: string | null;
          plan?: string;
          political_name?: string | null;
          preferred_news_neighborhood?: string | null;
          preferred_news_state?: string | null;
          priority_audience?: string | null;
          priority_cities?: string[];
          political_role?: string | null;
          positioning_phrase?: string | null;
          radar_interval_hours?: number;
          realtime_alerts_enabled?: boolean;
          region?: string | null;
          sentiment_enabled?: boolean;
          subscription_status?: string;
          target_position?: string | null;
          tiktok_handle?: string | null;
          tone?: string | null;
          trial_ends_at?: string | null;
          twitter_handle?: string | null;
          upload_file_limit?: number | null;
          updated_at?: string;
        };
        Update: {
          avatar_url?: string | null;
          bio?: string | null;
          created_at?: string;
          cron_interval_hours?: number;
          electoral_number?: string | null;
          facebook_handle?: string | null;
          full_name?: string | null;
          has_payment_method?: boolean;
          id?: string;
          intelligence_enabled?: boolean;
          instagram_handle?: string | null;
          manual_refresh_enabled?: boolean;
          max_users?: number;
          mention_keywords?: string[] | null;
          monitored_cities?: string[];
          monitored_networks?: string[];
          monitored_states?: string[];
          monitored_themes?: string[] | null;
          monthly_post_limit?: number | null;
          onboarded?: boolean;
          party?: string | null;
          plan?: string;
          political_name?: string | null;
          preferred_news_neighborhood?: string | null;
          preferred_news_state?: string | null;
          priority_audience?: string | null;
          priority_cities?: string[];
          political_role?: string | null;
          positioning_phrase?: string | null;
          radar_interval_hours?: number;
          realtime_alerts_enabled?: boolean;
          region?: string | null;
          sentiment_enabled?: boolean;
          subscription_status?: string;
          target_position?: string | null;
          tiktok_handle?: string | null;
          tone?: string | null;
          trial_ends_at?: string | null;
          twitter_handle?: string | null;
          upload_file_limit?: number | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      sentiment_snapshots: {
        Row: {
          created_at: string;
          id: string;
          negativo: number;
          networks: Json;
          neutro: number;
          positivo: number;
          top_topics: Json;
          total: number;
          user_id: string;
          window_end: string;
          window_start: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          negativo?: number;
          networks?: Json;
          neutro?: number;
          positivo?: number;
          top_topics?: Json;
          total?: number;
          user_id: string;
          window_end?: string;
          window_start: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          negativo?: number;
          networks?: Json;
          neutro?: number;
          positivo?: number;
          top_topics?: Json;
          total?: number;
          user_id?: string;
          window_end?: string;
          window_start?: string;
        };
        Relationships: [];
      };
      social_mentions: {
        Row: {
          author: string | null;
          collected_at: string;
          content: string;
          created_at: string;
          crisis_alert: boolean;
          external_id: string | null;
          geography: string | null;
          id: string;
          network: string;
          parent_post_caption: string | null;
          parent_post_id: string | null;
          parent_post_thumbnail: string | null;
          parent_post_url: string | null;
          posted_at: string | null;
          relevance_score: number;
          score: number | null;
          sentiment: string;
          source_type: string;
          theme: string | null;
          url: string | null;
          user_id: string;
        };
        Insert: {
          author?: string | null;
          collected_at?: string;
          content: string;
          created_at?: string;
          crisis_alert?: boolean;
          external_id?: string | null;
          geography?: string | null;
          id?: string;
          network: string;
          parent_post_caption?: string | null;
          parent_post_id?: string | null;
          parent_post_thumbnail?: string | null;
          parent_post_url?: string | null;
          posted_at?: string | null;
          relevance_score?: number;
          score?: number | null;
          sentiment?: string;
          source_type?: string;
          theme?: string | null;
          url?: string | null;
          user_id: string;
        };
        Update: {
          author?: string | null;
          collected_at?: string;
          content?: string;
          created_at?: string;
          crisis_alert?: boolean;
          external_id?: string | null;
          geography?: string | null;
          id?: string;
          network?: string;
          parent_post_caption?: string | null;
          parent_post_id?: string | null;
          parent_post_thumbnail?: string | null;
          parent_post_url?: string | null;
          posted_at?: string | null;
          relevance_score?: number;
          score?: number | null;
          sentiment?: string;
          source_type?: string;
          theme?: string | null;
          url?: string | null;
          user_id?: string;
        };
        Relationships: [];
      };
      states: {
        Row: {
          created_at: string;
          ibge_id: number | null;
          id: string;
          name: string;
          region: string | null;
          uf: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          ibge_id?: number | null;
          id?: string;
          name: string;
          region?: string | null;
          uf: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          ibge_id?: number | null;
          id?: string;
          name?: string;
          region?: string | null;
          uf?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      user_roles: {
        Row: {
          created_at: string;
          id: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          role?: Database["public"]["Enums"]["app_role"];
          user_id?: string;
        };
        Relationships: [];
      };
      telegram_channels: {
        Row: {
          agent_instructions: string | null;
          agent_persona: string;
          auto_reply_enabled: boolean;
          bot_username: string | null;
          chat_id: string | null;
          connection_status: string;
          created_at: string;
          creativity_level: string;
          escalation_message: string | null;
          id: string;
          llm_provider: string;
          response_depth: string;
          response_style: string;
          response_tone: string | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          agent_instructions?: string | null;
          agent_persona?: string;
          auto_reply_enabled?: boolean;
          bot_username?: string | null;
          chat_id?: string | null;
          connection_status?: string;
          created_at?: string;
          creativity_level?: string;
          escalation_message?: string | null;
          id?: string;
          llm_provider?: string;
          response_depth?: string;
          response_style?: string;
          response_tone?: string | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          agent_instructions?: string | null;
          agent_persona?: string;
          auto_reply_enabled?: boolean;
          bot_username?: string | null;
          chat_id?: string | null;
          connection_status?: string;
          created_at?: string;
          creativity_level?: string;
          escalation_message?: string | null;
          id?: string;
          llm_provider?: string;
          response_depth?: string;
          response_style?: string;
          response_tone?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      telegram_messages: {
        Row: {
          channel_id: string | null;
          confidence_score: number;
          contact_name: string | null;
          created_at: string;
          id: string;
          inbound_text: string;
          outbound_text: string | null;
          status: string;
          user_id: string;
        };
        Insert: {
          channel_id?: string | null;
          confidence_score?: number;
          contact_name?: string | null;
          created_at?: string;
          id?: string;
          inbound_text: string;
          outbound_text?: string | null;
          status?: string;
          user_id: string;
        };
        Update: {
          channel_id?: string | null;
          confidence_score?: number;
          contact_name?: string | null;
          created_at?: string;
          id?: string;
          inbound_text?: string;
          outbound_text?: string | null;
          status?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      whatsapp_channels: {
        Row: {
          agent_instructions: string | null;
          agent_persona: string;
          auto_reply_enabled: boolean;
          connection_status: string;
          created_at: string;
          creativity_level: string;
          escalation_message: string | null;
          id: string;
          llm_provider: string;
          provider: string;
          public_phone: string | null;
          response_depth: string;
          response_style: string;
          response_tone: string | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          agent_instructions?: string | null;
          agent_persona?: string;
          auto_reply_enabled?: boolean;
          connection_status?: string;
          created_at?: string;
          creativity_level?: string;
          escalation_message?: string | null;
          id?: string;
          llm_provider?: string;
          provider?: string;
          public_phone?: string | null;
          response_depth?: string;
          response_style?: string;
          response_tone?: string | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          agent_instructions?: string | null;
          agent_persona?: string;
          auto_reply_enabled?: boolean;
          connection_status?: string;
          created_at?: string;
          creativity_level?: string;
          escalation_message?: string | null;
          id?: string;
          llm_provider?: string;
          provider?: string;
          public_phone?: string | null;
          response_depth?: string;
          response_style?: string;
          response_tone?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      whatsapp_messages: {
        Row: {
          channel_id: string | null;
          confidence_score: number;
          contact_name: string | null;
          contact_phone: string | null;
          created_at: string;
          id: string;
          inbound_text: string;
          outbound_text: string | null;
          status: string;
          user_id: string;
        };
        Insert: {
          channel_id?: string | null;
          confidence_score?: number;
          contact_name?: string | null;
          contact_phone?: string | null;
          created_at?: string;
          id?: string;
          inbound_text: string;
          outbound_text?: string | null;
          status?: string;
          user_id: string;
        };
        Update: {
          channel_id?: string | null;
          confidence_score?: number;
          contact_name?: string | null;
          contact_phone?: string | null;
          created_at?: string;
          id?: string;
          inbound_text?: string;
          outbound_text?: string | null;
          status?: string;
          user_id?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      dashboard_stats: {
        Row: {
          critical_24h: number | null;
          last_24h: number | null;
          last_news_at: string | null;
          total: number | null;
          user_id: string | null;
        };
        Relationships: [];
      };
    };
    Functions: {
      expire_trials_without_payment: {
        Args: { _fallback_plan?: string };
        Returns: number;
      };
      get_my_cron_history: {
        Args: { _limit?: number };
        Returns: {
          action: string;
          created_at: string;
          error: string;
          hook: string;
          id: string;
          inserted_count: number;
          interval_hours: number;
          plan: string;
          reason: string;
          run_id: string;
          run_started_at: string;
          run_status: string;
        }[];
      };
      get_my_dashboard_stats: {
        Args: never;
        Returns: {
          critical_24h: number;
          last_24h: number;
          last_news_at: string;
          total: number;
        }[];
      };
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"];
          _user_id: string;
        };
        Returns: boolean;
      };
      match_legislative_memory: {
        Args: {
          _match_count?: number;
          _min_similarity?: number;
          _query_embedding: string;
          _user_id: string;
        };
        Returns: {
          content: string;
          id: string;
          metadata: Json;
          similarity: number;
          source_type: string;
          title: string;
        }[];
      };
      refresh_dashboard_stats: { Args: never; Returns: undefined };
    };
    Enums: {
      app_role: "admin" | "user";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "user"],
    },
  },
} as const;

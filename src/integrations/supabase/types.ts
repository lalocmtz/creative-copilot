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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      assets: {
        Row: {
          created_at: string
          credits_estimate_json: Json | null
          error_json: Json | null
          id: string
          metadata_json: Json | null
          rights_confirmed: boolean
          source_hash: string | null
          source_url: string
          status: Database["public"]["Enums"]["asset_status"]
          transcript: string | null
          understanding_json: Json | null
          user_id: string
          variants_json: Json | null
        }
        Insert: {
          created_at?: string
          credits_estimate_json?: Json | null
          error_json?: Json | null
          id?: string
          metadata_json?: Json | null
          rights_confirmed?: boolean
          source_hash?: string | null
          source_url: string
          status?: Database["public"]["Enums"]["asset_status"]
          transcript?: string | null
          understanding_json?: Json | null
          user_id: string
          variants_json?: Json | null
        }
        Update: {
          created_at?: string
          credits_estimate_json?: Json | null
          error_json?: Json | null
          id?: string
          metadata_json?: Json | null
          rights_confirmed?: boolean
          source_hash?: string | null
          source_url?: string
          status?: Database["public"]["Enums"]["asset_status"]
          transcript?: string | null
          understanding_json?: Json | null
          user_id?: string
          variants_json?: Json | null
        }
        Relationships: []
      }
      blueprints: {
        Row: {
          analysis_json: Json
          asset_id: string
          created_at: string
          id: string
          token_cost: number | null
          variations_json: Json
        }
        Insert: {
          analysis_json?: Json
          asset_id: string
          created_at?: string
          id?: string
          token_cost?: number | null
          variations_json?: Json
        }
        Update: {
          analysis_json?: Json
          asset_id?: string
          created_at?: string
          id?: string
          token_cost?: number | null
          variations_json?: Json
        }
        Relationships: [
          {
            foreignKeyName: "blueprints_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: true
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_reservations: {
        Row: {
          created_at: string
          credits: number
          id: string
          job_id: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          credits?: number
          id?: string
          job_id?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          credits?: number
          id?: string
          job_id?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      credit_transactions: {
        Row: {
          created_at: string
          credits_delta: number
          id: string
          related_render_id: string | null
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          credits_delta: number
          id?: string
          related_render_id?: string | null
          type: string
          user_id: string
        }
        Update: {
          created_at?: string
          credits_delta?: number
          id?: string
          related_render_id?: string | null
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_transactions_related_render_id_fkey"
            columns: ["related_render_id"]
            isOneToOne: false
            referencedRelation: "renders"
            referencedColumns: ["id"]
          },
        ]
      }
      jobs: {
        Row: {
          asset_id: string
          attempts: number
          cost_json: Json | null
          created_at: string
          error_message: string | null
          id: string
          idempotency_key: string
          provider_job_id: string | null
          render_id: string | null
          status: Database["public"]["Enums"]["job_status"]
          type: Database["public"]["Enums"]["job_type"]
          updated_at: string
          variant_id: string | null
        }
        Insert: {
          asset_id: string
          attempts?: number
          cost_json?: Json | null
          created_at?: string
          error_message?: string | null
          id?: string
          idempotency_key: string
          provider_job_id?: string | null
          render_id?: string | null
          status?: Database["public"]["Enums"]["job_status"]
          type: Database["public"]["Enums"]["job_type"]
          updated_at?: string
          variant_id?: string | null
        }
        Update: {
          asset_id?: string
          attempts?: number
          cost_json?: Json | null
          created_at?: string
          error_message?: string | null
          id?: string
          idempotency_key?: string
          provider_job_id?: string | null
          render_id?: string | null
          status?: Database["public"]["Enums"]["job_status"]
          type?: Database["public"]["Enums"]["job_type"]
          updated_at?: string
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "jobs_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_render_id_fkey"
            columns: ["render_id"]
            isOneToOne: false
            referencedRelation: "renders"
            referencedColumns: ["id"]
          },
        ]
      }
      provider_status: {
        Row: {
          degraded_until: string | null
          failure_count: number
          last_failure_at: string | null
          provider: string
          status: string
          updated_at: string
        }
        Insert: {
          degraded_until?: string | null
          failure_count?: number
          last_failure_at?: string | null
          provider: string
          status?: string
          updated_at?: string
        }
        Update: {
          degraded_until?: string | null
          failure_count?: number
          last_failure_at?: string | null
          provider?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      renders: {
        Row: {
          actor_id: string | null
          asset_id: string
          base_image_url: string | null
          cost_breakdown_json: Json | null
          created_at: string
          emotional_intensity: number | null
          final_video_url: string | null
          id: string
          product_image_url: string | null
          render_cost: number | null
          scenario_prompt: string | null
          status: Database["public"]["Enums"]["render_status"]
          variation_level: number
          voice_id: string | null
        }
        Insert: {
          actor_id?: string | null
          asset_id: string
          base_image_url?: string | null
          cost_breakdown_json?: Json | null
          created_at?: string
          emotional_intensity?: number | null
          final_video_url?: string | null
          id?: string
          product_image_url?: string | null
          render_cost?: number | null
          scenario_prompt?: string | null
          status?: Database["public"]["Enums"]["render_status"]
          variation_level?: number
          voice_id?: string | null
        }
        Update: {
          actor_id?: string | null
          asset_id?: string
          base_image_url?: string | null
          cost_breakdown_json?: Json | null
          created_at?: string
          emotional_intensity?: number | null
          final_video_url?: string | null
          id?: string
          product_image_url?: string | null
          render_cost?: number | null
          scenario_prompt?: string | null
          status?: Database["public"]["Enums"]["render_status"]
          variation_level?: number
          voice_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "renders_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
        ]
      }
      user_credits: {
        Row: {
          created_at: string
          id: string
          total_credits: number
          updated_at: string
          used_credits: number
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          total_credits?: number
          updated_at?: string
          used_credits?: number
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          total_credits?: number
          updated_at?: string
          used_credits?: number
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      asset_status:
        | "PENDING"
        | "VIDEO_INGESTED"
        | "BLUEPRINT_GENERATED"
        | "IMAGE_APPROVED"
        | "VIDEO_RENDERED"
        | "FAILED"
        | "DOWNLOADING"
        | "DOWNLOADED"
        | "TRANSCRIBING"
        | "UNDERSTANDING"
        | "VARIANTS_READY"
        | "IMAGE_READY"
        | "RENDERING"
        | "DONE"
      job_status:
        | "PENDING"
        | "RUNNING"
        | "DONE"
        | "FAILED"
        | "QUEUED"
        | "RETRY_SCHEDULED"
        | "DELAYED_PROVIDER_DEGRADED"
        | "FAILED_FATAL"
        | "FAILED_PROVIDER"
      job_type:
        | "download_video"
        | "transcribe"
        | "blueprint"
        | "base_image"
        | "tts"
        | "video"
        | "lipsync"
        | "merge"
        | "understand"
        | "build_variants"
        | "generate_base_image"
        | "animate_sora"
      render_status:
        | "DRAFT"
        | "IMAGE_GENERATED"
        | "IMAGE_APPROVED"
        | "RENDERING"
        | "DONE"
        | "FAILED"
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
      asset_status: [
        "PENDING",
        "VIDEO_INGESTED",
        "BLUEPRINT_GENERATED",
        "IMAGE_APPROVED",
        "VIDEO_RENDERED",
        "FAILED",
        "DOWNLOADING",
        "DOWNLOADED",
        "TRANSCRIBING",
        "UNDERSTANDING",
        "VARIANTS_READY",
        "IMAGE_READY",
        "RENDERING",
        "DONE",
      ],
      job_status: [
        "PENDING",
        "RUNNING",
        "DONE",
        "FAILED",
        "QUEUED",
        "RETRY_SCHEDULED",
        "DELAYED_PROVIDER_DEGRADED",
        "FAILED_FATAL",
        "FAILED_PROVIDER",
      ],
      job_type: [
        "download_video",
        "transcribe",
        "blueprint",
        "base_image",
        "tts",
        "video",
        "lipsync",
        "merge",
        "understand",
        "build_variants",
        "generate_base_image",
        "animate_sora",
      ],
      render_status: [
        "DRAFT",
        "IMAGE_GENERATED",
        "IMAGE_APPROVED",
        "RENDERING",
        "DONE",
        "FAILED",
      ],
    },
  },
} as const

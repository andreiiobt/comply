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
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      badges: {
        Row: {
          badge_type: string
          company_id: string
          created_at: string
          description: string | null
          emoji: string | null
          id: string
          image_url: string | null
          name: string
          trigger_id: string
          trigger_type: string
        }
        Insert: {
          badge_type?: string
          company_id: string
          created_at?: string
          description?: string | null
          emoji?: string | null
          id?: string
          image_url?: string | null
          name: string
          trigger_id: string
          trigger_type?: string
        }
        Update: {
          badge_type?: string
          company_id?: string
          created_at?: string
          description?: string | null
          emoji?: string | null
          id?: string
          image_url?: string | null
          name?: string
          trigger_id?: string
          trigger_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "badges_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      checklist_assignments: {
        Row: {
          assign_type: string
          assign_value: string | null
          company_id: string
          created_at: string
          due_date: string | null
          id: string
          is_active: boolean
          recurrence_days: number[] | null
          recurrence_time: string | null
          recurrence_type: string
          template_id: string
        }
        Insert: {
          assign_type?: string
          assign_value?: string | null
          company_id: string
          created_at?: string
          due_date?: string | null
          id?: string
          is_active?: boolean
          recurrence_days?: number[] | null
          recurrence_time?: string | null
          recurrence_type?: string
          template_id: string
        }
        Update: {
          assign_type?: string
          assign_value?: string | null
          company_id?: string
          created_at?: string
          due_date?: string | null
          id?: string
          is_active?: boolean
          recurrence_days?: number[] | null
          recurrence_time?: string | null
          recurrence_type?: string
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "checklist_assignments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklist_assignments_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "checklist_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      checklist_submissions: {
        Row: {
          attachments: Json
          block_id: string | null
          checked_items: Json
          completed_at: string | null
          completed_by: string | null
          created_at: string
          duration_seconds: number | null
          id: string
          lesson_id: string | null
          notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          reviewer_note: string | null
          started_at: string | null
          status: string
          template_id: string | null
          template_snapshot: Json | null
          template_title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          attachments?: Json
          block_id?: string | null
          checked_items?: Json
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          duration_seconds?: number | null
          id?: string
          lesson_id?: string | null
          notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          reviewer_note?: string | null
          started_at?: string | null
          status?: string
          template_id?: string | null
          template_snapshot?: Json | null
          template_title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          attachments?: Json
          block_id?: string | null
          checked_items?: Json
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          duration_seconds?: number | null
          id?: string
          lesson_id?: string | null
          notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          reviewer_note?: string | null
          started_at?: string | null
          status?: string
          template_id?: string | null
          template_snapshot?: Json | null
          template_title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "checklist_submissions_block_id_fkey"
            columns: ["block_id"]
            isOneToOne: false
            referencedRelation: "lesson_content"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklist_submissions_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklist_submissions_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "checklist_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      checklist_template_versions: {
        Row: {
          category: string | null
          change_summary: string | null
          changed_at: string
          changed_by: string
          description: string | null
          id: string
          items: Json
          template_id: string
          title: string
          version_number: number
        }
        Insert: {
          category?: string | null
          change_summary?: string | null
          changed_at?: string
          changed_by: string
          description?: string | null
          id?: string
          items?: Json
          template_id: string
          title: string
          version_number?: number
        }
        Update: {
          category?: string | null
          change_summary?: string | null
          changed_at?: string
          changed_by?: string
          description?: string | null
          id?: string
          items?: Json
          template_id?: string
          title?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "checklist_template_versions_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "checklist_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      checklist_templates: {
        Row: {
          category: string | null
          company_id: string
          created_at: string
          description: string | null
          id: string
          is_archived: boolean
          is_published: boolean
          items: Json
          title: string
          updated_at: string
        }
        Insert: {
          category?: string | null
          company_id: string
          created_at?: string
          description?: string | null
          id?: string
          is_archived?: boolean
          is_published?: boolean
          items?: Json
          title: string
          updated_at?: string
        }
        Update: {
          category?: string | null
          company_id?: string
          created_at?: string
          description?: string | null
          id?: string
          is_archived?: boolean
          is_published?: boolean
          items?: Json
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "checklist_templates_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          accent_color: string
          created_at: string
          id: string
          logo_url: string | null
          name: string
          polar_customer_id: string | null
          primary_color: string
          rewards_enabled: boolean
          secondary_color: string
          slug: string | null
          trial_ends_at: string | null
          trial_started_at: string | null
          updated_at: string
        }
        Insert: {
          accent_color?: string
          created_at?: string
          id?: string
          logo_url?: string | null
          name: string
          polar_customer_id?: string | null
          primary_color?: string
          rewards_enabled?: boolean
          secondary_color?: string
          slug?: string | null
          trial_ends_at?: string | null
          trial_started_at?: string | null
          updated_at?: string
        }
        Update: {
          accent_color?: string
          created_at?: string
          id?: string
          logo_url?: string | null
          name?: string
          polar_customer_id?: string | null
          primary_color?: string
          rewards_enabled?: boolean
          secondary_color?: string
          slug?: string | null
          trial_ends_at?: string | null
          trial_started_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      courses: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_published: boolean
          learning_path_id: string
          sort_order: number
          thumbnail_url: string | null
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_published?: boolean
          learning_path_id: string
          sort_order?: number
          thumbnail_url?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_published?: boolean
          learning_path_id?: string
          sort_order?: number
          thumbnail_url?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "courses_learning_path_id_fkey"
            columns: ["learning_path_id"]
            isOneToOne: false
            referencedRelation: "learning_paths"
            referencedColumns: ["id"]
          },
        ]
      }
      custom_roles: {
        Row: {
          company_id: string
          created_at: string
          id: string
          name: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "custom_roles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      email_send_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          message_id: string | null
          metadata: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email?: string
          status?: string
          template_name?: string
        }
        Relationships: []
      }
      email_send_state: {
        Row: {
          auth_email_ttl_minutes: number
          batch_size: number
          id: number
          retry_after_until: string | null
          send_delay_ms: number
          transactional_email_ttl_minutes: number
          updated_at: string
        }
        Insert: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Update: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      email_unsubscribe_tokens: {
        Row: {
          created_at: string
          email: string
          id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: []
      }
      f2f_enrollments: {
        Row: {
          attended: boolean
          enrolled_at: string
          id: string
          session_id: string
          status: string
          user_id: string
        }
        Insert: {
          attended?: boolean
          enrolled_at?: string
          id?: string
          session_id: string
          status?: string
          user_id: string
        }
        Update: {
          attended?: boolean
          enrolled_at?: string
          id?: string
          session_id?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "f2f_enrollments_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "f2f_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      f2f_sessions: {
        Row: {
          capacity: number | null
          company_id: string
          created_at: string
          created_by: string
          description: string | null
          duration_minutes: number
          id: string
          is_published: boolean
          session_date: string
          target_type: string
          target_value: string | null
          title: string
          updated_at: string
          venue: string | null
        }
        Insert: {
          capacity?: number | null
          company_id: string
          created_at?: string
          created_by: string
          description?: string | null
          duration_minutes?: number
          id?: string
          is_published?: boolean
          session_date: string
          target_type?: string
          target_value?: string | null
          title: string
          updated_at?: string
          venue?: string | null
        }
        Update: {
          capacity?: number | null
          company_id?: string
          created_at?: string
          created_by?: string
          description?: string | null
          duration_minutes?: number
          id?: string
          is_published?: boolean
          session_date?: string
          target_type?: string
          target_value?: string | null
          title?: string
          updated_at?: string
          venue?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "f2f_sessions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      hris_integrations: {
        Row: {
          company_id: string
          created_at: string
          field_mappings: Json
          id: string
          is_active: boolean
          last_synced_at: string | null
          merge_account_token: string
          sync_interval_hours: number
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          field_mappings?: Json
          id?: string
          is_active?: boolean
          last_synced_at?: string | null
          merge_account_token: string
          sync_interval_hours?: number
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          field_mappings?: Json
          id?: string
          is_active?: boolean
          last_synced_at?: string | null
          merge_account_token?: string
          sync_interval_hours?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hris_integrations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      hris_sync_log: {
        Row: {
          company_id: string
          completed_at: string | null
          created_at: string
          error_message: string | null
          id: string
          started_at: string
          status: string
          users_created: number
          users_deactivated: number
          users_updated: number
        }
        Insert: {
          company_id: string
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          started_at?: string
          status?: string
          users_created?: number
          users_deactivated?: number
          users_updated?: number
        }
        Update: {
          company_id?: string
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          started_at?: string
          status?: string
          users_created?: number
          users_deactivated?: number
          users_updated?: number
        }
        Relationships: [
          {
            foreignKeyName: "hris_sync_log_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      incident_reports: {
        Row: {
          assigned_to: string | null
          attachments: Json
          company_id: string
          created_at: string
          description: string
          details: Json
          id: string
          incident_date: string
          involved_user_ids: Json
          location_id: string | null
          referral_for_treatment: string | null
          severity: string
          status: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          assigned_to?: string | null
          attachments?: Json
          company_id: string
          created_at?: string
          description: string
          details?: Json
          id?: string
          incident_date?: string
          involved_user_ids?: Json
          location_id?: string | null
          referral_for_treatment?: string | null
          severity?: string
          status?: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          assigned_to?: string | null
          attachments?: Json
          company_id?: string
          created_at?: string
          description?: string
          details?: Json
          id?: string
          incident_date?: string
          involved_user_ids?: Json
          location_id?: string | null
          referral_for_treatment?: string | null
          severity?: string
          status?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "incident_reports_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incident_reports_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      invitations: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          company_id: string
          created_at: string
          created_by: string
          email: string | null
          expires_at: string
          id: string
          invite_code: string
          invite_type: string
          location_id: string | null
          role: Database["public"]["Enums"]["app_role"]
          status: string
          sub_role: string | null
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          company_id: string
          created_at?: string
          created_by: string
          email?: string | null
          expires_at?: string
          id?: string
          invite_code: string
          invite_type?: string
          location_id?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          status?: string
          sub_role?: string | null
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          company_id?: string
          created_at?: string
          created_by?: string
          email?: string | null
          expires_at?: string
          id?: string
          invite_code?: string
          invite_type?: string
          location_id?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          status?: string
          sub_role?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invitations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invitations_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      learning_paths: {
        Row: {
          company_id: string
          cover_image_url: string | null
          created_at: string
          description: string | null
          enforce_order: boolean
          estimated_minutes: number | null
          icon: string | null
          id: string
          is_archived: boolean
          is_published: boolean
          sort_order: number
          title: string
          updated_at: string
        }
        Insert: {
          company_id: string
          cover_image_url?: string | null
          created_at?: string
          description?: string | null
          enforce_order?: boolean
          estimated_minutes?: number | null
          icon?: string | null
          id?: string
          is_archived?: boolean
          is_published?: boolean
          sort_order?: number
          title: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          cover_image_url?: string | null
          created_at?: string
          description?: string | null
          enforce_order?: boolean
          estimated_minutes?: number | null
          icon?: string | null
          id?: string
          is_archived?: boolean
          is_published?: boolean
          sort_order?: number
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "learning_paths_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      lesson_content: {
        Row: {
          block_type: Database["public"]["Enums"]["content_block_type"]
          content: string | null
          correct_answer: string | null
          created_at: string
          id: string
          image_url: string | null
          lesson_id: string
          options: Json | null
          question_type: Database["public"]["Enums"]["question_type"] | null
          sort_order: number
          title: string | null
          updated_at: string
        }
        Insert: {
          block_type: Database["public"]["Enums"]["content_block_type"]
          content?: string | null
          correct_answer?: string | null
          created_at?: string
          id?: string
          image_url?: string | null
          lesson_id: string
          options?: Json | null
          question_type?: Database["public"]["Enums"]["question_type"] | null
          sort_order?: number
          title?: string | null
          updated_at?: string
        }
        Update: {
          block_type?: Database["public"]["Enums"]["content_block_type"]
          content?: string | null
          correct_answer?: string | null
          created_at?: string
          id?: string
          image_url?: string | null
          lesson_id?: string
          options?: Json | null
          question_type?: Database["public"]["Enums"]["question_type"] | null
          sort_order?: number
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lesson_content_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
        ]
      }
      lessons: {
        Row: {
          course_id: string
          created_at: string
          id: string
          is_published: boolean
          passing_score: number | null
          sort_order: number
          title: string
          updated_at: string
          xp_reward: number
        }
        Insert: {
          course_id: string
          created_at?: string
          id?: string
          is_published?: boolean
          passing_score?: number | null
          sort_order?: number
          title: string
          updated_at?: string
          xp_reward?: number
        }
        Update: {
          course_id?: string
          created_at?: string
          id?: string
          is_published?: boolean
          passing_score?: number | null
          sort_order?: number
          title?: string
          updated_at?: string
          xp_reward?: number
        }
        Relationships: [
          {
            foreignKeyName: "lessons_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      location_tag_assignments: {
        Row: {
          created_at: string
          id: string
          location_id: string
          tag_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          location_id: string
          tag_id: string
        }
        Update: {
          created_at?: string
          id?: string
          location_id?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "location_tag_assignments_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "location_tag_assignments_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "location_tags"
            referencedColumns: ["id"]
          },
        ]
      }
      location_tags: {
        Row: {
          color: string | null
          company_id: string
          created_at: string
          id: string
          name: string
        }
        Insert: {
          color?: string | null
          company_id: string
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          color?: string | null
          company_id?: string
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "location_tags_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      locations: {
        Row: {
          address: string | null
          company_id: string
          created_at: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          company_id: string
          created_at?: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          company_id?: string
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "locations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      path_assignments: {
        Row: {
          assign_location_id: string | null
          assign_role: Database["public"]["Enums"]["app_role"] | null
          assign_sub_role: string | null
          assign_type: Database["public"]["Enums"]["assign_type"]
          assign_user_id: string | null
          auto_assign: boolean
          company_id: string
          created_at: string
          due_within_days: number | null
          id: string
          is_active: boolean
          learning_path_id: string
          prerequisite_path_id: string | null
          trigger_days_after_join: number | null
          trigger_type: string
          updated_at: string
        }
        Insert: {
          assign_location_id?: string | null
          assign_role?: Database["public"]["Enums"]["app_role"] | null
          assign_sub_role?: string | null
          assign_type: Database["public"]["Enums"]["assign_type"]
          assign_user_id?: string | null
          auto_assign?: boolean
          company_id: string
          created_at?: string
          due_within_days?: number | null
          id?: string
          is_active?: boolean
          learning_path_id: string
          prerequisite_path_id?: string | null
          trigger_days_after_join?: number | null
          trigger_type?: string
          updated_at?: string
        }
        Update: {
          assign_location_id?: string | null
          assign_role?: Database["public"]["Enums"]["app_role"] | null
          assign_sub_role?: string | null
          assign_type?: Database["public"]["Enums"]["assign_type"]
          assign_user_id?: string | null
          auto_assign?: boolean
          company_id?: string
          created_at?: string
          due_within_days?: number | null
          id?: string
          is_active?: boolean
          learning_path_id?: string
          prerequisite_path_id?: string | null
          trigger_days_after_join?: number | null
          trigger_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "path_assignments_assign_location_id_fkey"
            columns: ["assign_location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "path_assignments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "path_assignments_learning_path_id_fkey"
            columns: ["learning_path_id"]
            isOneToOne: false
            referencedRelation: "learning_paths"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "path_assignments_prerequisite_path_id_fkey"
            columns: ["prerequisite_path_id"]
            isOneToOne: false
            referencedRelation: "learning_paths"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          address: string | null
          avatar_url: string | null
          company_id: string | null
          created_at: string
          current_streak: number
          email: string | null
          full_name: string | null
          id: string
          longest_streak: number
          merge_employee_id: string | null
          updated_at: string
          user_id: string
          xp: number
        }
        Insert: {
          address?: string | null
          avatar_url?: string | null
          company_id?: string | null
          created_at?: string
          current_streak?: number
          email?: string | null
          full_name?: string | null
          id?: string
          longest_streak?: number
          merge_employee_id?: string | null
          updated_at?: string
          user_id: string
          xp?: number
        }
        Update: {
          address?: string | null
          avatar_url?: string | null
          company_id?: string | null
          created_at?: string
          current_streak?: number
          email?: string | null
          full_name?: string | null
          id?: string
          longest_streak?: number
          merge_employee_id?: string | null
          updated_at?: string
          user_id?: string
          xp?: number
        }
        Relationships: [
          {
            foreignKeyName: "profiles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      quiz_attempts: {
        Row: {
          created_at: string
          id: string
          lesson_id: string
          passed: boolean
          score: number
          total: number
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          lesson_id: string
          passed?: boolean
          score?: number
          total?: number
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          lesson_id?: string
          passed?: boolean
          score?: number
          total?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "quiz_attempts_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
        ]
      }
      reward_redemptions: {
        Row: {
          admin_note: string | null
          created_at: string
          id: string
          processed_at: string | null
          reward_id: string
          status: string
          user_id: string
          xp_spent: number
        }
        Insert: {
          admin_note?: string | null
          created_at?: string
          id?: string
          processed_at?: string | null
          reward_id: string
          status?: string
          user_id: string
          xp_spent: number
        }
        Update: {
          admin_note?: string | null
          created_at?: string
          id?: string
          processed_at?: string | null
          reward_id?: string
          status?: string
          user_id?: string
          xp_spent?: number
        }
        Relationships: [
          {
            foreignKeyName: "reward_redemptions_reward_id_fkey"
            columns: ["reward_id"]
            isOneToOne: false
            referencedRelation: "rewards"
            referencedColumns: ["id"]
          },
        ]
      }
      rewards: {
        Row: {
          company_id: string
          created_at: string
          custom_role_id: string | null
          description: string | null
          id: string
          image_url: string | null
          is_active: boolean
          name: string
          quantity_limit: number | null
          quantity_redeemed: number
          xp_cost: number
        }
        Insert: {
          company_id: string
          created_at?: string
          custom_role_id?: string | null
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          name: string
          quantity_limit?: number | null
          quantity_redeemed?: number
          xp_cost: number
        }
        Update: {
          company_id?: string
          created_at?: string
          custom_role_id?: string | null
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          name?: string
          quantity_limit?: number | null
          quantity_redeemed?: number
          xp_cost?: number
        }
        Relationships: [
          {
            foreignKeyName: "rewards_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rewards_custom_role_id_fkey"
            columns: ["custom_role_id"]
            isOneToOne: false
            referencedRelation: "custom_roles"
            referencedColumns: ["id"]
          },
        ]
      }
      setup_completed: {
        Row: {
          completed: boolean
          completed_at: string | null
          id: number
        }
        Insert: {
          completed?: boolean
          completed_at?: string | null
          id?: number
        }
        Update: {
          completed?: boolean
          completed_at?: string | null
          id?: number
        }
        Relationships: []
      }
      streaks: {
        Row: {
          activity_date: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          activity_date?: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          activity_date?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      suppressed_emails: {
        Row: {
          created_at: string
          email: string
          id: string
          metadata: Json | null
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          metadata?: Json | null
          reason: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          metadata?: Json | null
          reason?: string
        }
        Relationships: []
      }
      user_badges: {
        Row: {
          badge_id: string
          earned_at: string
          id: string
          user_id: string
        }
        Insert: {
          badge_id: string
          earned_at?: string
          id?: string
          user_id: string
        }
        Update: {
          badge_id?: string
          earned_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_badges_badge_id_fkey"
            columns: ["badge_id"]
            isOneToOne: false
            referencedRelation: "badges"
            referencedColumns: ["id"]
          },
        ]
      }
      user_custom_roles: {
        Row: {
          company_id: string
          created_at: string
          custom_role_id: string
          id: string
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          custom_role_id: string
          id?: string
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          custom_role_id?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_custom_roles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_custom_roles_custom_role_id_fkey"
            columns: ["custom_role_id"]
            isOneToOne: false
            referencedRelation: "custom_roles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_progress: {
        Row: {
          completed: boolean
          completed_at: string | null
          created_at: string
          id: string
          lesson_id: string
          user_id: string
          xp_earned: number
        }
        Insert: {
          completed?: boolean
          completed_at?: string | null
          created_at?: string
          id?: string
          lesson_id: string
          user_id: string
          xp_earned?: number
        }
        Update: {
          completed?: boolean
          completed_at?: string | null
          created_at?: string
          id?: string
          lesson_id?: string
          user_id?: string
          xp_earned?: number
        }
        Relationships: [
          {
            foreignKeyName: "user_progress_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          company_id: string
          id: string
          location_id: string | null
          role: Database["public"]["Enums"]["app_role"]
          sub_role: string | null
          user_id: string
        }
        Insert: {
          company_id: string
          id?: string
          location_id?: string | null
          role: Database["public"]["Enums"]["app_role"]
          sub_role?: string | null
          user_id: string
        }
        Update: {
          company_id?: string
          id?: string
          location_id?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          sub_role?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_roles_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_roles_user_id_profiles_fk"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      get_company_by_slug: {
        Args: { _slug: string }
        Returns: {
          accent_color: string
          created_at: string
          id: string
          logo_url: string | null
          name: string
          polar_customer_id: string | null
          primary_color: string
          rewards_enabled: boolean
          secondary_color: string
          slug: string | null
          trial_ends_at: string | null
          trial_started_at: string | null
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "companies"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_company_leaderboard: {
        Args: { _limit?: number; _user_id: string }
        Returns: {
          avatar_url: string
          current_streak: number
          full_name: string
          location_name: string
          longest_streak: number
          user_id: string
          xp: number
        }[]
      }
      get_user_assignments: { Args: { _user_id: string }; Returns: string[] }
      get_user_company_id: { Args: { _user_id: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      increment_xp: {
        Args: { _user_id: string; _xp: number }
        Returns: undefined
      }
      is_setup_complete: { Args: never; Returns: boolean }
      is_supervisor_of: { Args: { _target_user_id: string }; Returns: boolean }
      move_to_dlq: {
        Args: {
          dlq_name: string
          message_id: number
          payload: Json
          source_queue: string
        }
        Returns: number
      }
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
      }
      redeem_reward: {
        Args: { _reward_id: string; _user_id: string }
        Returns: Json
      }
      update_streak: { Args: { _user_id: string }; Returns: undefined }
    }
    Enums: {
      app_role: "admin" | "manager" | "supervisor" | "staff"
      assign_type: "all" | "role" | "location" | "individual" | "sub_role"
      content_block_type:
        | "section"
        | "card"
        | "question"
        | "training_checklist"
        | "video"
        | "accordion"
        | "callout"
        | "flashcard"
        | "fill_blank"
        | "matching"
        | "hotspot"
        | "divider"
        | "numbered_steps"
        | "audio"
        | "code_snippet"
      question_type: "multiple_choice" | "true_false" | "free_text"
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
      app_role: ["admin", "manager", "supervisor", "staff"],
      assign_type: ["all", "role", "location", "individual", "sub_role"],
      content_block_type: [
        "section",
        "card",
        "question",
        "training_checklist",
        "video",
        "accordion",
        "callout",
        "flashcard",
        "fill_blank",
        "matching",
        "hotspot",
        "divider",
        "numbered_steps",
        "audio",
        "code_snippet",
      ],
      question_type: ["multiple_choice", "true_false", "free_text"],
    },
  },
} as const

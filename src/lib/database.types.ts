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
      abc_classification_config: {
        Row: {
          brand_id: string
          count_freq_a_days: number
          count_freq_b_days: number
          count_freq_c_days: number
          created_at: string
          id: string
          is_active: boolean
          last_recalc_at: string | null
          metadata: Json | null
          new_item_default_class: string
          new_item_grace_months: number
          notes: string | null
          recalc_trigger: string
          rolling_period_months: number
          safety_stock_days_a: number
          safety_stock_days_b: number
          safety_stock_days_c: number
          threshold_a_pct: number
          threshold_b_pct: number
          updated_at: string
        }
        Insert: {
          brand_id?: string
          count_freq_a_days?: number
          count_freq_b_days?: number
          count_freq_c_days?: number
          created_at?: string
          id?: string
          is_active?: boolean
          last_recalc_at?: string | null
          metadata?: Json | null
          new_item_default_class?: string
          new_item_grace_months?: number
          notes?: string | null
          recalc_trigger?: string
          rolling_period_months?: number
          safety_stock_days_a?: number
          safety_stock_days_b?: number
          safety_stock_days_c?: number
          threshold_a_pct?: number
          threshold_b_pct?: number
          updated_at?: string
        }
        Update: {
          brand_id?: string
          count_freq_a_days?: number
          count_freq_b_days?: number
          count_freq_c_days?: number
          created_at?: string
          id?: string
          is_active?: boolean
          last_recalc_at?: string | null
          metadata?: Json | null
          new_item_default_class?: string
          new_item_grace_months?: number
          notes?: string | null
          recalc_trigger?: string
          rolling_period_months?: number
          safety_stock_days_a?: number
          safety_stock_days_b?: number
          safety_stock_days_c?: number
          threshold_a_pct?: number
          threshold_b_pct?: number
          updated_at?: string
        }
        Relationships: []
      }
      abc_classification_results: {
        Row: {
          abc_class: string
          brand_id: string
          created_at: string
          cum_pct: number | null
          id: string
          item_id: string
          metadata: Json | null
          output_amount_12m: number
          output_qty_12m: number
          prev_class: string | null
          rank_in_brand: number | null
          recalc_at: string
          updated_at: string
          warehouse_id: string | null
        }
        Insert: {
          abc_class: string
          brand_id?: string
          created_at?: string
          cum_pct?: number | null
          id?: string
          item_id: string
          metadata?: Json | null
          output_amount_12m?: number
          output_qty_12m?: number
          prev_class?: string | null
          rank_in_brand?: number | null
          recalc_at?: string
          updated_at?: string
          warehouse_id?: string | null
        }
        Update: {
          abc_class?: string
          brand_id?: string
          created_at?: string
          cum_pct?: number | null
          id?: string
          item_id?: string
          metadata?: Json | null
          output_amount_12m?: number
          output_qty_12m?: number
          prev_class?: string | null
          rank_in_brand?: number | null
          recalc_at?: string
          updated_at?: string
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "abc_classification_results_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "abc_classification_results_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      accounting_periods: {
        Row: {
          closed_at: string | null
          closed_by: string | null
          created_at: string
          end_date: string
          fiscal_year: number
          id: string
          metadata: Json
          period_number: number
          period_type: string
          start_date: string
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          end_date: string
          fiscal_year: number
          id?: string
          metadata?: Json
          period_number: number
          period_type: string
          start_date: string
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          end_date?: string
          fiscal_year?: number
          id?: string
          metadata?: Json
          period_number?: number
          period_type?: string
          start_date?: string
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      aftersales_technicians: {
        Row: {
          actual_minutes: number
          available_minutes: number
          avatar_color: string | null
          brand_id: string
          code: string
          created_at: string | null
          current_bay_code: string | null
          current_item: string | null
          current_ro_code: string | null
          grade: string | null
          id: string
          is_active: boolean
          jobs_done: number
          jobs_total: number
          metadata: Json | null
          name: string
          organization_id: string | null
          sold_minutes: number
          sort_order: number
          started_at: string | null
          status: string
          subsidiary_id: string | null
          updated_at: string | null
        }
        Insert: {
          actual_minutes?: number
          available_minutes?: number
          avatar_color?: string | null
          brand_id: string
          code: string
          created_at?: string | null
          current_bay_code?: string | null
          current_item?: string | null
          current_ro_code?: string | null
          grade?: string | null
          id?: string
          is_active?: boolean
          jobs_done?: number
          jobs_total?: number
          metadata?: Json | null
          name: string
          organization_id?: string | null
          sold_minutes?: number
          sort_order?: number
          started_at?: string | null
          status?: string
          subsidiary_id?: string | null
          updated_at?: string | null
        }
        Update: {
          actual_minutes?: number
          available_minutes?: number
          avatar_color?: string | null
          brand_id?: string
          code?: string
          created_at?: string | null
          current_bay_code?: string | null
          current_item?: string | null
          current_ro_code?: string | null
          grade?: string | null
          id?: string
          is_active?: boolean
          jobs_done?: number
          jobs_total?: number
          metadata?: Json | null
          name?: string
          organization_id?: string | null
          sold_minutes?: number
          sort_order?: number
          started_at?: string | null
          status?: string
          subsidiary_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "aftersales_technicians_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aftersales_technicians_subsidiary_id_fkey"
            columns: ["subsidiary_id"]
            isOneToOne: false
            referencedRelation: "subsidiaries"
            referencedColumns: ["id"]
          },
        ]
      }
      alert_events: {
        Row: {
          acked_at: string | null
          acked_by: string | null
          brand_id: string
          created_at: string
          id: string
          metadata: Json | null
          notes: string | null
          notified_at: string | null
          notified_via: string[]
          payload: Json
          ref_id: string | null
          ref_type: string
          resolved_at: string | null
          resolved_by: string | null
          rule_id: string | null
          severity: string
          status: string
          updated_at: string
        }
        Insert: {
          acked_at?: string | null
          acked_by?: string | null
          brand_id?: string
          created_at?: string
          id?: string
          metadata?: Json | null
          notes?: string | null
          notified_at?: string | null
          notified_via?: string[]
          payload?: Json
          ref_id?: string | null
          ref_type: string
          resolved_at?: string | null
          resolved_by?: string | null
          rule_id?: string | null
          severity?: string
          status?: string
          updated_at?: string
        }
        Update: {
          acked_at?: string | null
          acked_by?: string | null
          brand_id?: string
          created_at?: string
          id?: string
          metadata?: Json | null
          notes?: string | null
          notified_at?: string | null
          notified_via?: string[]
          payload?: Json
          ref_id?: string | null
          ref_type?: string
          resolved_at?: string | null
          resolved_by?: string | null
          rule_id?: string | null
          severity?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "alert_events_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "alert_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      alert_rules: {
        Row: {
          alert_type: string
          auto_action: string | null
          brand_id: string
          code: string
          cooldown_minutes: number
          created_at: string
          created_by: string | null
          id: string
          is_enabled: boolean
          metadata: Json | null
          name: string
          notes: string | null
          notify_channels: string[]
          severity: string
          trigger_dsl: Json
          updated_at: string
        }
        Insert: {
          alert_type: string
          auto_action?: string | null
          brand_id?: string
          code: string
          cooldown_minutes?: number
          created_at?: string
          created_by?: string | null
          id?: string
          is_enabled?: boolean
          metadata?: Json | null
          name: string
          notes?: string | null
          notify_channels?: string[]
          severity?: string
          trigger_dsl?: Json
          updated_at?: string
        }
        Update: {
          alert_type?: string
          auto_action?: string | null
          brand_id?: string
          code?: string
          cooldown_minutes?: number
          created_at?: string
          created_by?: string | null
          id?: string
          is_enabled?: boolean
          metadata?: Json | null
          name?: string
          notes?: string | null
          notify_channels?: string[]
          severity?: string
          trigger_dsl?: Json
          updated_at?: string
        }
        Relationships: []
      }
      app_admins: {
        Row: {
          email: string
          granted_at: string
          granted_by: string | null
          notes: string | null
        }
        Insert: {
          email: string
          granted_at?: string
          granted_by?: string | null
          notes?: string | null
        }
        Update: {
          email?: string
          granted_at?: string
          granted_by?: string | null
          notes?: string | null
        }
        Relationships: []
      }
      appointments: {
        Row: {
          appointment_date: string
          appointment_time: string
          arrived_at: string | null
          assigned_technician_id: string | null
          brand_id: string
          completed_at: string | null
          created_at: string | null
          created_by: string | null
          customer_id: string | null
          estimated_hours: number | null
          id: string
          metadata: Json | null
          notes: string | null
          service_subtype: string | null
          service_type: string
          started_at: string | null
          status: string
          store_id: string | null
          subsidiary_id: string | null
          updated_at: string | null
          vehicle_id: string | null
        }
        Insert: {
          appointment_date: string
          appointment_time: string
          arrived_at?: string | null
          assigned_technician_id?: string | null
          brand_id: string
          completed_at?: string | null
          created_at?: string | null
          created_by?: string | null
          customer_id?: string | null
          estimated_hours?: number | null
          id?: string
          metadata?: Json | null
          notes?: string | null
          service_subtype?: string | null
          service_type: string
          started_at?: string | null
          status?: string
          store_id?: string | null
          subsidiary_id?: string | null
          updated_at?: string | null
          vehicle_id?: string | null
        }
        Update: {
          appointment_date?: string
          appointment_time?: string
          arrived_at?: string | null
          assigned_technician_id?: string | null
          brand_id?: string
          completed_at?: string | null
          created_at?: string | null
          created_by?: string | null
          customer_id?: string | null
          estimated_hours?: number | null
          id?: string
          metadata?: Json | null
          notes?: string | null
          service_subtype?: string | null
          service_type?: string
          started_at?: string | null
          status?: string
          store_id?: string | null
          subsidiary_id?: string | null
          updated_at?: string | null
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "appointments_assigned_technician_id_fkey"
            columns: ["assigned_technician_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_subsidiary_id_fkey"
            columns: ["subsidiary_id"]
            isOneToOne: false
            referencedRelation: "subsidiaries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "customer_vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      brand_appearance: {
        Row: {
          brand_id: string
          brand_palette: string
          custom_palette: Json | null
          dashboard_tagline: string | null
          footer_badge_path: string | null
          footer_badge_url: string | null
          shell_layout: string
          shell_options: Json
          sidebar_theme: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          brand_id: string
          brand_palette?: string
          custom_palette?: Json | null
          dashboard_tagline?: string | null
          footer_badge_path?: string | null
          footer_badge_url?: string | null
          shell_layout?: string
          shell_options?: Json
          sidebar_theme?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          brand_id?: string
          brand_palette?: string
          custom_palette?: Json | null
          dashboard_tagline?: string | null
          footer_badge_path?: string | null
          footer_badge_url?: string | null
          shell_layout?: string
          shell_options?: Json
          sidebar_theme?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      brand_modules: {
        Row: {
          brand_id: string
          enabled: boolean
          module_key: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          brand_id: string
          enabled?: boolean
          module_key: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          brand_id?: string
          enabled?: boolean
          module_key?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "brand_modules_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      brands: {
        Row: {
          created_at: string
          default_subsidiary_id: string | null
          id: string
          manufacturer: string | null
          name: string
          netsuite_segment_value_id: string | null
          netsuite_synced_at: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          default_subsidiary_id?: string | null
          id: string
          manufacturer?: string | null
          name: string
          netsuite_segment_value_id?: string | null
          netsuite_synced_at?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          default_subsidiary_id?: string | null
          id?: string
          manufacturer?: string | null
          name?: string
          netsuite_segment_value_id?: string | null
          netsuite_synced_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "brands_default_subsidiary_id_fkey"
            columns: ["default_subsidiary_id"]
            isOneToOne: false
            referencedRelation: "subsidiaries"
            referencedColumns: ["id"]
          },
        ]
      }
      business_rules: {
        Row: {
          brand_id: string
          config: Json
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          metadata: Json
          rule_kind: string
          scope_role_code: string | null
          scope_store_id: string | null
          scope_subsidiary_id: string | null
          sort_order: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          brand_id: string
          config?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          metadata?: Json
          rule_kind: string
          scope_role_code?: string | null
          scope_store_id?: string | null
          scope_subsidiary_id?: string | null
          sort_order?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          brand_id?: string
          config?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          metadata?: Json
          rule_kind?: string
          scope_role_code?: string | null
          scope_store_id?: string | null
          scope_subsidiary_id?: string | null
          sort_order?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "business_rules_scope_role_code_fkey"
            columns: ["scope_role_code"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_rules_scope_store_id_fkey"
            columns: ["scope_store_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_rules_scope_subsidiary_id_fkey"
            columns: ["scope_subsidiary_id"]
            isOneToOne: false
            referencedRelation: "subsidiaries"
            referencedColumns: ["id"]
          },
        ]
      }
      call_tasks: {
        Row: {
          answers: Json
          assignee_id: string | null
          attempt_count: number
          brand_id: string
          call_result: string | null
          call_type: string | null
          created_at: string
          created_by: string | null
          customer_id: string
          id: string
          kind: string
          last_attempt_at: string | null
          metadata: Json
          notes: string | null
          scheduled_at: string | null
          status: string
          survey_template_id: string | null
          updated_at: string
        }
        Insert: {
          answers?: Json
          assignee_id?: string | null
          attempt_count?: number
          brand_id: string
          call_result?: string | null
          call_type?: string | null
          created_at?: string
          created_by?: string | null
          customer_id: string
          id?: string
          kind: string
          last_attempt_at?: string | null
          metadata?: Json
          notes?: string | null
          scheduled_at?: string | null
          status?: string
          survey_template_id?: string | null
          updated_at?: string
        }
        Update: {
          answers?: Json
          assignee_id?: string | null
          attempt_count?: number
          brand_id?: string
          call_result?: string | null
          call_type?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string
          id?: string
          kind?: string
          last_attempt_at?: string | null
          metadata?: Json
          notes?: string | null
          scheduled_at?: string | null
          status?: string
          survey_template_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "call_tasks_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "call_tasks_survey_template_id_fkey"
            columns: ["survey_template_id"]
            isOneToOne: false
            referencedRelation: "survey_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      chart_of_accounts: {
        Row: {
          account_code: string
          ai_tags: Json | null
          benchmark_enabled: boolean | null
          created_at: string
          created_by: string | null
          dealer_category: Database["public"]["Enums"]["dealer_category"]
          depth: number
          description: string | null
          display_indent_name: string | null
          display_order: number
          id: string
          is_active: boolean
          is_locked: boolean
          is_postable: boolean
          is_system_default: boolean
          l1_category: Database["public"]["Enums"]["coa_l1_category"]
          l1_code: string
          l2_code: string
          l3_code: string | null
          l4_code: string | null
          l5_code: string | null
          level: Database["public"]["Enums"]["coa_level"]
          metadata: Json | null
          moea_code: string | null
          moea_name_zh: string | null
          name_en: string | null
          name_zh_tw: string
          netsuite_account_internal_id: string | null
          netsuite_account_number: string | null
          netsuite_sync_status: string | null
          netsuite_synced_at: string | null
          normal_balance: string
          parent_code: string | null
          parent_id: string | null
          posting_example: string | null
          required_dimensions: Json
          tax_treatment: Database["public"]["Enums"]["tax_treatment"]
          tenant_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          account_code: string
          ai_tags?: Json | null
          benchmark_enabled?: boolean | null
          created_at?: string
          created_by?: string | null
          dealer_category?: Database["public"]["Enums"]["dealer_category"]
          depth: number
          description?: string | null
          display_indent_name?: string | null
          display_order?: number
          id?: string
          is_active?: boolean
          is_locked?: boolean
          is_postable?: boolean
          is_system_default?: boolean
          l1_category: Database["public"]["Enums"]["coa_l1_category"]
          l1_code: string
          l2_code: string
          l3_code?: string | null
          l4_code?: string | null
          l5_code?: string | null
          level: Database["public"]["Enums"]["coa_level"]
          metadata?: Json | null
          moea_code?: string | null
          moea_name_zh?: string | null
          name_en?: string | null
          name_zh_tw: string
          netsuite_account_internal_id?: string | null
          netsuite_account_number?: string | null
          netsuite_sync_status?: string | null
          netsuite_synced_at?: string | null
          normal_balance: string
          parent_code?: string | null
          parent_id?: string | null
          posting_example?: string | null
          required_dimensions?: Json
          tax_treatment?: Database["public"]["Enums"]["tax_treatment"]
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          account_code?: string
          ai_tags?: Json | null
          benchmark_enabled?: boolean | null
          created_at?: string
          created_by?: string | null
          dealer_category?: Database["public"]["Enums"]["dealer_category"]
          depth?: number
          description?: string | null
          display_indent_name?: string | null
          display_order?: number
          id?: string
          is_active?: boolean
          is_locked?: boolean
          is_postable?: boolean
          is_system_default?: boolean
          l1_category?: Database["public"]["Enums"]["coa_l1_category"]
          l1_code?: string
          l2_code?: string
          l3_code?: string | null
          l4_code?: string | null
          l5_code?: string | null
          level?: Database["public"]["Enums"]["coa_level"]
          metadata?: Json | null
          moea_code?: string | null
          moea_name_zh?: string | null
          name_en?: string | null
          name_zh_tw?: string
          netsuite_account_internal_id?: string | null
          netsuite_account_number?: string | null
          netsuite_sync_status?: string | null
          netsuite_synced_at?: string | null
          normal_balance?: string
          parent_code?: string | null
          parent_id?: string | null
          posting_example?: string | null
          required_dimensions?: Json
          tax_treatment?: Database["public"]["Enums"]["tax_treatment"]
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chart_of_accounts_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      classifications: {
        Row: {
          brand_id: string
          code: string
          created_at: string
          external_id: string | null
          external_source: string
          id: string
          is_active: boolean
          metadata: Json | null
          name: string
          synced_at: string | null
          type: string | null
          updated_at: string
        }
        Insert: {
          brand_id?: string
          code: string
          created_at?: string
          external_id?: string | null
          external_source?: string
          id?: string
          is_active?: boolean
          metadata?: Json | null
          name: string
          synced_at?: string | null
          type?: string | null
          updated_at?: string
        }
        Update: {
          brand_id?: string
          code?: string
          created_at?: string
          external_id?: string | null
          external_source?: string
          id?: string
          is_active?: boolean
          metadata?: Json | null
          name?: string
          synced_at?: string | null
          type?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      coa_seed_accounts: {
        Row: {
          account_code: string
          ai_tags: Json | null
          created_at: string
          dealer_category: Database["public"]["Enums"]["dealer_category"]
          default_enabled: boolean
          depth: number
          description: string | null
          display_order: number
          id: number
          is_locked: boolean
          is_postable: boolean
          l1_category: Database["public"]["Enums"]["coa_l1_category"]
          l1_code: string
          l2_code: string
          l3_code: string | null
          l4_code: string | null
          l5_code: string | null
          level: Database["public"]["Enums"]["coa_level"]
          moea_code: string | null
          moea_name_zh: string | null
          name_en: string | null
          name_zh_tw: string
          normal_balance: string
          parent_code: string | null
          posting_example: string | null
          required_dimensions: Json
          tax_treatment: Database["public"]["Enums"]["tax_treatment"]
          template_packs: string[]
          version: string
        }
        Insert: {
          account_code: string
          ai_tags?: Json | null
          created_at?: string
          dealer_category: Database["public"]["Enums"]["dealer_category"]
          default_enabled?: boolean
          depth: number
          description?: string | null
          display_order?: number
          id?: number
          is_locked?: boolean
          is_postable?: boolean
          l1_category: Database["public"]["Enums"]["coa_l1_category"]
          l1_code: string
          l2_code: string
          l3_code?: string | null
          l4_code?: string | null
          l5_code?: string | null
          level: Database["public"]["Enums"]["coa_level"]
          moea_code?: string | null
          moea_name_zh?: string | null
          name_en?: string | null
          name_zh_tw: string
          normal_balance: string
          parent_code?: string | null
          posting_example?: string | null
          required_dimensions?: Json
          tax_treatment: Database["public"]["Enums"]["tax_treatment"]
          template_packs: string[]
          version?: string
        }
        Update: {
          account_code?: string
          ai_tags?: Json | null
          created_at?: string
          dealer_category?: Database["public"]["Enums"]["dealer_category"]
          default_enabled?: boolean
          depth?: number
          description?: string | null
          display_order?: number
          id?: number
          is_locked?: boolean
          is_postable?: boolean
          l1_category?: Database["public"]["Enums"]["coa_l1_category"]
          l1_code?: string
          l2_code?: string
          l3_code?: string | null
          l4_code?: string | null
          l5_code?: string | null
          level?: Database["public"]["Enums"]["coa_level"]
          moea_code?: string | null
          moea_name_zh?: string | null
          name_en?: string | null
          name_zh_tw?: string
          normal_balance?: string
          parent_code?: string | null
          posting_example?: string | null
          required_dimensions?: Json
          tax_treatment?: Database["public"]["Enums"]["tax_treatment"]
          template_packs?: string[]
          version?: string
        }
        Relationships: []
      }
      consignment_stocks: {
        Row: {
          bin_id: string | null
          brand_id: string
          con_no: string
          created_at: string
          created_by: string | null
          end_date: string
          id: string
          initial_qty: number
          item_id: string
          metadata: Json | null
          notes: string | null
          remaining_qty: number
          start_date: string
          status: string
          supplier_id: string
          transferred_at: string | null
          transferred_qty: number
          unit_cost: number | null
          updated_at: string
          warehouse_id: string
        }
        Insert: {
          bin_id?: string | null
          brand_id?: string
          con_no: string
          created_at?: string
          created_by?: string | null
          end_date: string
          id?: string
          initial_qty: number
          item_id: string
          metadata?: Json | null
          notes?: string | null
          remaining_qty: number
          start_date: string
          status?: string
          supplier_id: string
          transferred_at?: string | null
          transferred_qty?: number
          unit_cost?: number | null
          updated_at?: string
          warehouse_id: string
        }
        Update: {
          bin_id?: string | null
          brand_id?: string
          con_no?: string
          created_at?: string
          created_by?: string | null
          end_date?: string
          id?: string
          initial_qty?: number
          item_id?: string
          metadata?: Json | null
          notes?: string | null
          remaining_qty?: number
          start_date?: string
          status?: string
          supplier_id?: string
          transferred_at?: string | null
          transferred_qty?: number
          unit_cost?: number | null
          updated_at?: string
          warehouse_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "consignment_stocks_bin_id_fkey"
            columns: ["bin_id"]
            isOneToOne: false
            referencedRelation: "warehouse_bins"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consignment_stocks_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consignment_stocks_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consignment_stocks_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_contacts: {
        Row: {
          brand_id: string
          created_at: string
          customer_id: string
          email: string | null
          id: string
          is_active: boolean
          metadata: Json | null
          name: string
          notes: string | null
          phone: string | null
          relation: string | null
          role: string
          subsidiary_id: string | null
          updated_at: string
        }
        Insert: {
          brand_id: string
          created_at?: string
          customer_id: string
          email?: string | null
          id?: string
          is_active?: boolean
          metadata?: Json | null
          name: string
          notes?: string | null
          phone?: string | null
          relation?: string | null
          role?: string
          subsidiary_id?: string | null
          updated_at?: string
        }
        Update: {
          brand_id?: string
          created_at?: string
          customer_id?: string
          email?: string | null
          id?: string
          is_active?: boolean
          metadata?: Json | null
          name?: string
          notes?: string | null
          phone?: string | null
          relation?: string | null
          role?: string
          subsidiary_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_contacts_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_contacts_subsidiary_id_fkey"
            columns: ["subsidiary_id"]
            isOneToOne: false
            referencedRelation: "subsidiaries"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_personal_tags: {
        Row: {
          brand_id: string
          color: string
          created_at: string
          id: string
          is_active: boolean
          metadata: Json
          name: string
          note: string | null
          owner_id: string
          updated_at: string
          use_count: number
        }
        Insert: {
          brand_id: string
          color: string
          created_at?: string
          id?: string
          is_active?: boolean
          metadata?: Json
          name: string
          note?: string | null
          owner_id: string
          updated_at?: string
          use_count?: number
        }
        Update: {
          brand_id?: string
          color?: string
          created_at?: string
          id?: string
          is_active?: boolean
          metadata?: Json
          name?: string
          note?: string | null
          owner_id?: string
          updated_at?: string
          use_count?: number
        }
        Relationships: []
      }
      customer_tags: {
        Row: {
          brand_id: string
          code: string | null
          color: string
          created_at: string
          created_by: string | null
          description: string | null
          emoji: string | null
          id: string
          is_active: boolean
          label: string
          metadata: Json
          sort_order: number
          updated_at: string
        }
        Insert: {
          brand_id: string
          code?: string | null
          color: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          emoji?: string | null
          id?: string
          is_active?: boolean
          label: string
          metadata?: Json
          sort_order?: number
          updated_at?: string
        }
        Update: {
          brand_id?: string
          code?: string | null
          color?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          emoji?: string | null
          id?: string
          is_active?: boolean
          label?: string
          metadata?: Json
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      customer_vehicles: {
        Row: {
          acquired_from: string
          brand_id: string
          color: string | null
          created_at: string
          created_by: string | null
          current_mileage: number | null
          customer_id: string
          desmo_service_due_date: string | null
          desmo_service_due_mileage: number | null
          engine_no: string | null
          external_id: string | null
          external_source: string
          id: string
          insurance_company: string | null
          insurance_policy_no: string | null
          insurance_until: string | null
          is_active: boolean
          last_service_date: string | null
          last_service_mileage: number | null
          license_plate: string | null
          manufactured_year: number | null
          metadata: Json | null
          model_id: string | null
          next_service_due_date: string | null
          next_service_due_mileage: number | null
          notes: string | null
          preferred_technician_id: string | null
          purchase_amount: number | null
          purchase_date: string | null
          subsidiary_id: string | null
          synced_at: string | null
          updated_at: string
          vin: string | null
          warranty_until: string | null
        }
        Insert: {
          acquired_from?: string
          brand_id: string
          color?: string | null
          created_at?: string
          created_by?: string | null
          current_mileage?: number | null
          customer_id: string
          desmo_service_due_date?: string | null
          desmo_service_due_mileage?: number | null
          engine_no?: string | null
          external_id?: string | null
          external_source?: string
          id?: string
          insurance_company?: string | null
          insurance_policy_no?: string | null
          insurance_until?: string | null
          is_active?: boolean
          last_service_date?: string | null
          last_service_mileage?: number | null
          license_plate?: string | null
          manufactured_year?: number | null
          metadata?: Json | null
          model_id?: string | null
          next_service_due_date?: string | null
          next_service_due_mileage?: number | null
          notes?: string | null
          preferred_technician_id?: string | null
          purchase_amount?: number | null
          purchase_date?: string | null
          subsidiary_id?: string | null
          synced_at?: string | null
          updated_at?: string
          vin?: string | null
          warranty_until?: string | null
        }
        Update: {
          acquired_from?: string
          brand_id?: string
          color?: string | null
          created_at?: string
          created_by?: string | null
          current_mileage?: number | null
          customer_id?: string
          desmo_service_due_date?: string | null
          desmo_service_due_mileage?: number | null
          engine_no?: string | null
          external_id?: string | null
          external_source?: string
          id?: string
          insurance_company?: string | null
          insurance_policy_no?: string | null
          insurance_until?: string | null
          is_active?: boolean
          last_service_date?: string | null
          last_service_mileage?: number | null
          license_plate?: string | null
          manufactured_year?: number | null
          metadata?: Json | null
          model_id?: string | null
          next_service_due_date?: string | null
          next_service_due_mileage?: number | null
          notes?: string | null
          preferred_technician_id?: string | null
          purchase_amount?: number | null
          purchase_date?: string | null
          subsidiary_id?: string | null
          synced_at?: string | null
          updated_at?: string
          vin?: string | null
          warranty_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_vehicles_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_vehicles_model_id_fkey"
            columns: ["model_id"]
            isOneToOne: false
            referencedRelation: "vehicle_models"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_vehicles_preferred_technician_id_fkey"
            columns: ["preferred_technician_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_vehicles_subsidiary_id_fkey"
            columns: ["subsidiary_id"]
            isOneToOne: false
            referencedRelation: "subsidiaries"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          address: string | null
          assigned_sa_user_id: string | null
          birthday: string | null
          brand_id: string
          code: string
          created_at: string
          created_by: string | null
          credit_limit: number | null
          customer_type: string | null
          default_tax_code_id: string | null
          email: string | null
          external_id: string | null
          external_source: string
          follow_up_status: string | null
          gl_receivable_coa_id: string | null
          habc_grade: string | null
          id: string
          is_active: boolean
          metadata: Json | null
          name: string
          national_id: string | null
          next_follow_up_date: string | null
          notes: string | null
          payment_terms_days: number | null
          phone: string | null
          source_module: string | null
          subsidiary_id: string | null
          synced_at: string | null
          tax_id: string | null
          type: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          assigned_sa_user_id?: string | null
          birthday?: string | null
          brand_id?: string
          code: string
          created_at?: string
          created_by?: string | null
          credit_limit?: number | null
          customer_type?: string | null
          default_tax_code_id?: string | null
          email?: string | null
          external_id?: string | null
          external_source?: string
          follow_up_status?: string | null
          gl_receivable_coa_id?: string | null
          habc_grade?: string | null
          id?: string
          is_active?: boolean
          metadata?: Json | null
          name: string
          national_id?: string | null
          next_follow_up_date?: string | null
          notes?: string | null
          payment_terms_days?: number | null
          phone?: string | null
          source_module?: string | null
          subsidiary_id?: string | null
          synced_at?: string | null
          tax_id?: string | null
          type?: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          assigned_sa_user_id?: string | null
          birthday?: string | null
          brand_id?: string
          code?: string
          created_at?: string
          created_by?: string | null
          credit_limit?: number | null
          customer_type?: string | null
          default_tax_code_id?: string | null
          email?: string | null
          external_id?: string | null
          external_source?: string
          follow_up_status?: string | null
          gl_receivable_coa_id?: string | null
          habc_grade?: string | null
          id?: string
          is_active?: boolean
          metadata?: Json | null
          name?: string
          national_id?: string | null
          next_follow_up_date?: string | null
          notes?: string | null
          payment_terms_days?: number | null
          phone?: string | null
          source_module?: string | null
          subsidiary_id?: string | null
          synced_at?: string | null
          tax_id?: string | null
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customers_default_tax_code_id_fkey"
            columns: ["default_tax_code_id"]
            isOneToOne: false
            referencedRelation: "tax_codes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customers_gl_receivable_coa_id_fkey"
            columns: ["gl_receivable_coa_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customers_subsidiary_id_fkey"
            columns: ["subsidiary_id"]
            isOneToOne: false
            referencedRelation: "subsidiaries"
            referencedColumns: ["id"]
          },
        ]
      }
      deliveries: {
        Row: {
          accessories_list: Json | null
          accessories_note: string | null
          actual_delivery_date: string | null
          brand_id: string
          ceremony_photos: string[] | null
          created_at: string | null
          created_by: string | null
          customer_address: string | null
          customer_birthday: string | null
          customer_doc_signature: string | null
          customer_email: string | null
          customer_id: string | null
          customer_name: string | null
          customer_phone: string | null
          customer_vehicle_id: string | null
          delivered_at: string | null
          delivered_by: string | null
          delivery_checklist: Json | null
          delivery_no: string
          handover_docs_checklist: Json | null
          id: string
          keys_count: number | null
          keys_delivered_at: string | null
          metadata: Json | null
          notes: string | null
          organization_id: string | null
          pdi_checklist: Json | null
          pdi_work_order_no: string | null
          plate_date: string | null
          plate_no: string | null
          received_by_customer_name: string | null
          rs_name: string | null
          sales_order_id: string | null
          scheduled_delivery_date: string | null
          sig_customer: string | null
          sig_rs: string | null
          sig_technician: string | null
          status: string
          step_completion: Json | null
          subsidiary_id: string | null
          updated_at: string | null
          updated_by: string | null
          vehicle_color: string | null
          vehicle_model_id: string | null
          vehicle_model_name: string | null
          vin: string | null
          warranty_checklist: Json | null
          warranty_consents: Json | null
          warranty_no: string | null
          warranty_receive_date: string | null
          warranty_registered: boolean | null
          warranty_registered_at: string | null
          warranty_start_date: string | null
        }
        Insert: {
          accessories_list?: Json | null
          accessories_note?: string | null
          actual_delivery_date?: string | null
          brand_id: string
          ceremony_photos?: string[] | null
          created_at?: string | null
          created_by?: string | null
          customer_address?: string | null
          customer_birthday?: string | null
          customer_doc_signature?: string | null
          customer_email?: string | null
          customer_id?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          customer_vehicle_id?: string | null
          delivered_at?: string | null
          delivered_by?: string | null
          delivery_checklist?: Json | null
          delivery_no: string
          handover_docs_checklist?: Json | null
          id?: string
          keys_count?: number | null
          keys_delivered_at?: string | null
          metadata?: Json | null
          notes?: string | null
          organization_id?: string | null
          pdi_checklist?: Json | null
          pdi_work_order_no?: string | null
          plate_date?: string | null
          plate_no?: string | null
          received_by_customer_name?: string | null
          rs_name?: string | null
          sales_order_id?: string | null
          scheduled_delivery_date?: string | null
          sig_customer?: string | null
          sig_rs?: string | null
          sig_technician?: string | null
          status?: string
          step_completion?: Json | null
          subsidiary_id?: string | null
          updated_at?: string | null
          updated_by?: string | null
          vehicle_color?: string | null
          vehicle_model_id?: string | null
          vehicle_model_name?: string | null
          vin?: string | null
          warranty_checklist?: Json | null
          warranty_consents?: Json | null
          warranty_no?: string | null
          warranty_receive_date?: string | null
          warranty_registered?: boolean | null
          warranty_registered_at?: string | null
          warranty_start_date?: string | null
        }
        Update: {
          accessories_list?: Json | null
          accessories_note?: string | null
          actual_delivery_date?: string | null
          brand_id?: string
          ceremony_photos?: string[] | null
          created_at?: string | null
          created_by?: string | null
          customer_address?: string | null
          customer_birthday?: string | null
          customer_doc_signature?: string | null
          customer_email?: string | null
          customer_id?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          customer_vehicle_id?: string | null
          delivered_at?: string | null
          delivered_by?: string | null
          delivery_checklist?: Json | null
          delivery_no?: string
          handover_docs_checklist?: Json | null
          id?: string
          keys_count?: number | null
          keys_delivered_at?: string | null
          metadata?: Json | null
          notes?: string | null
          organization_id?: string | null
          pdi_checklist?: Json | null
          pdi_work_order_no?: string | null
          plate_date?: string | null
          plate_no?: string | null
          received_by_customer_name?: string | null
          rs_name?: string | null
          sales_order_id?: string | null
          scheduled_delivery_date?: string | null
          sig_customer?: string | null
          sig_rs?: string | null
          sig_technician?: string | null
          status?: string
          step_completion?: Json | null
          subsidiary_id?: string | null
          updated_at?: string | null
          updated_by?: string | null
          vehicle_color?: string | null
          vehicle_model_id?: string | null
          vehicle_model_name?: string | null
          vin?: string | null
          warranty_checklist?: Json | null
          warranty_consents?: Json | null
          warranty_no?: string | null
          warranty_receive_date?: string | null
          warranty_registered?: boolean | null
          warranty_registered_at?: string | null
          warranty_start_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "deliveries_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deliveries_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deliveries_customer_vehicle_id_fkey"
            columns: ["customer_vehicle_id"]
            isOneToOne: false
            referencedRelation: "customer_vehicles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deliveries_delivered_by_fkey"
            columns: ["delivered_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deliveries_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deliveries_sales_order_id_fkey"
            columns: ["sales_order_id"]
            isOneToOne: false
            referencedRelation: "sales_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deliveries_subsidiary_id_fkey"
            columns: ["subsidiary_id"]
            isOneToOne: false
            referencedRelation: "subsidiaries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deliveries_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deliveries_vehicle_model_id_fkey"
            columns: ["vehicle_model_id"]
            isOneToOne: false
            referencedRelation: "vehicle_models"
            referencedColumns: ["id"]
          },
        ]
      }
      departments: {
        Row: {
          brand_id: string
          code: string
          created_at: string
          external_id: string | null
          external_source: string
          id: string
          is_active: boolean
          manager_employee_id: string | null
          metadata: Json | null
          name: string
          netsuite_department_id: string | null
          netsuite_synced_at: string | null
          parent_id: string | null
          subsidiary_id: string | null
          synced_at: string | null
          updated_at: string
        }
        Insert: {
          brand_id?: string
          code: string
          created_at?: string
          external_id?: string | null
          external_source?: string
          id?: string
          is_active?: boolean
          manager_employee_id?: string | null
          metadata?: Json | null
          name: string
          netsuite_department_id?: string | null
          netsuite_synced_at?: string | null
          parent_id?: string | null
          subsidiary_id?: string | null
          synced_at?: string | null
          updated_at?: string
        }
        Update: {
          brand_id?: string
          code?: string
          created_at?: string
          external_id?: string | null
          external_source?: string
          id?: string
          is_active?: boolean
          manager_employee_id?: string | null
          metadata?: Json | null
          name?: string
          netsuite_department_id?: string | null
          netsuite_synced_at?: string | null
          parent_id?: string | null
          subsidiary_id?: string | null
          synced_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "departments_manager_employee_id_fkey"
            columns: ["manager_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "departments_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "departments_subsidiary_id_fkey"
            columns: ["subsidiary_id"]
            isOneToOne: false
            referencedRelation: "subsidiaries"
            referencedColumns: ["id"]
          },
        ]
      }
      document_number_rules: {
        Row: {
          brand_id: string
          created_at: string
          current_seq: number
          doc_type: string
          id: string
          last_reset_at: string | null
          metadata: Json | null
          notes: string | null
          pattern: string
          prefix: string
          reset_period: string
          updated_at: string
        }
        Insert: {
          brand_id?: string
          created_at?: string
          current_seq?: number
          doc_type: string
          id?: string
          last_reset_at?: string | null
          metadata?: Json | null
          notes?: string | null
          pattern?: string
          prefix: string
          reset_period?: string
          updated_at?: string
        }
        Update: {
          brand_id?: string
          created_at?: string
          current_seq?: number
          doc_type?: string
          id?: string
          last_reset_at?: string | null
          metadata?: Json | null
          notes?: string | null
          pattern?: string
          prefix?: string
          reset_period?: string
          updated_at?: string
        }
        Relationships: []
      }
      einvoice_allowances: {
        Row: {
          brand_id: string
          created_at: string
          ecpay_allowance_no: string | null
          ecpay_error_msg: string | null
          einvoice_id: string
          id: string
          is_online: boolean
          issued_at: string | null
          issued_by: string | null
          items: Json
          metadata: Json | null
          notify_method: string | null
          notify_target: string | null
          reason: string | null
          status: string
          tax_amount: number
          total_amount: number
          updated_at: string
        }
        Insert: {
          brand_id: string
          created_at?: string
          ecpay_allowance_no?: string | null
          ecpay_error_msg?: string | null
          einvoice_id: string
          id?: string
          is_online?: boolean
          issued_at?: string | null
          issued_by?: string | null
          items?: Json
          metadata?: Json | null
          notify_method?: string | null
          notify_target?: string | null
          reason?: string | null
          status?: string
          tax_amount?: number
          total_amount: number
          updated_at?: string
        }
        Update: {
          brand_id?: string
          created_at?: string
          ecpay_allowance_no?: string | null
          ecpay_error_msg?: string | null
          einvoice_id?: string
          id?: string
          is_online?: boolean
          issued_at?: string | null
          issued_by?: string | null
          items?: Json
          metadata?: Json | null
          notify_method?: string | null
          notify_target?: string | null
          reason?: string | null
          status?: string
          tax_amount?: number
          total_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "einvoice_allowances_einvoice_id_fkey"
            columns: ["einvoice_id"]
            isOneToOne: false
            referencedRelation: "einvoices"
            referencedColumns: ["id"]
          },
        ]
      }
      einvoice_number_pools: {
        Row: {
          brand_id: string
          created_at: string
          end_no: number
          id: string
          is_active: boolean
          metadata: Json | null
          period: string
          prefix: string
          start_no: number
          synced_at: string | null
          used_count: number
        }
        Insert: {
          brand_id: string
          created_at?: string
          end_no: number
          id?: string
          is_active?: boolean
          metadata?: Json | null
          period: string
          prefix: string
          start_no: number
          synced_at?: string | null
          used_count?: number
        }
        Update: {
          brand_id?: string
          created_at?: string
          end_no?: number
          id?: string
          is_active?: boolean
          metadata?: Json | null
          period?: string
          prefix?: string
          start_no?: number
          synced_at?: string | null
          used_count?: number
        }
        Relationships: []
      }
      einvoice_voids: {
        Row: {
          brand_id: string
          created_at: string
          einvoice_id: string
          id: string
          metadata: Json | null
          reason: string
          voided_at: string
          voided_by: string | null
        }
        Insert: {
          brand_id: string
          created_at?: string
          einvoice_id: string
          id?: string
          metadata?: Json | null
          reason: string
          voided_at?: string
          voided_by?: string | null
        }
        Update: {
          brand_id?: string
          created_at?: string
          einvoice_id?: string
          id?: string
          metadata?: Json | null
          reason?: string
          voided_at?: string
          voided_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "einvoice_voids_einvoice_id_fkey"
            columns: ["einvoice_id"]
            isOneToOne: false
            referencedRelation: "einvoices"
            referencedColumns: ["id"]
          },
        ]
      }
      einvoices: {
        Row: {
          brand_id: string
          buyer_address: string | null
          buyer_email: string | null
          buyer_name: string | null
          buyer_phone: string | null
          carrier_code: string | null
          carrier_type: string | null
          created_at: string
          donation_code: string | null
          ecpay_error_msg: string | null
          ecpay_invoice_date: string | null
          ecpay_invoice_no: string | null
          ecpay_random_number: string | null
          ecpay_status: string
          id: string
          invoice_type: string
          issued_at: string | null
          issued_by: string | null
          items: Json
          metadata: Json | null
          remark: string | null
          source_id: string | null
          source_module: string
          source_ref: string | null
          tax_amount: number
          tax_id: string | null
          tax_type: string
          total_amount: number
          updated_at: string
        }
        Insert: {
          brand_id: string
          buyer_address?: string | null
          buyer_email?: string | null
          buyer_name?: string | null
          buyer_phone?: string | null
          carrier_code?: string | null
          carrier_type?: string | null
          created_at?: string
          donation_code?: string | null
          ecpay_error_msg?: string | null
          ecpay_invoice_date?: string | null
          ecpay_invoice_no?: string | null
          ecpay_random_number?: string | null
          ecpay_status?: string
          id?: string
          invoice_type: string
          issued_at?: string | null
          issued_by?: string | null
          items?: Json
          metadata?: Json | null
          remark?: string | null
          source_id?: string | null
          source_module: string
          source_ref?: string | null
          tax_amount?: number
          tax_id?: string | null
          tax_type?: string
          total_amount: number
          updated_at?: string
        }
        Update: {
          brand_id?: string
          buyer_address?: string | null
          buyer_email?: string | null
          buyer_name?: string | null
          buyer_phone?: string | null
          carrier_code?: string | null
          carrier_type?: string | null
          created_at?: string
          donation_code?: string | null
          ecpay_error_msg?: string | null
          ecpay_invoice_date?: string | null
          ecpay_invoice_no?: string | null
          ecpay_random_number?: string | null
          ecpay_status?: string
          id?: string
          invoice_type?: string
          issued_at?: string | null
          issued_by?: string | null
          items?: Json
          metadata?: Json | null
          remark?: string | null
          source_id?: string | null
          source_module?: string
          source_ref?: string | null
          tax_amount?: number
          tax_id?: string | null
          tax_type?: string
          total_amount?: number
          updated_at?: string
        }
        Relationships: []
      }
      employee_certifications: {
        Row: {
          brand_id: string
          cert_name: string | null
          cert_type: string
          created_at: string
          employee_id: string
          expires_at: string | null
          external_id: string | null
          external_source: string
          id: string
          issued_at: string | null
          issuer: string | null
          metadata: Json | null
          notes: string | null
          synced_at: string | null
          updated_at: string
        }
        Insert: {
          brand_id: string
          cert_name?: string | null
          cert_type: string
          created_at?: string
          employee_id: string
          expires_at?: string | null
          external_id?: string | null
          external_source?: string
          id?: string
          issued_at?: string | null
          issuer?: string | null
          metadata?: Json | null
          notes?: string | null
          synced_at?: string | null
          updated_at?: string
        }
        Update: {
          brand_id?: string
          cert_name?: string | null
          cert_type?: string
          created_at?: string
          employee_id?: string
          expires_at?: string | null
          external_id?: string | null
          external_source?: string
          id?: string
          issued_at?: string | null
          issuer?: string | null
          metadata?: Json | null
          notes?: string | null
          synced_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_certifications_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      employees: {
        Row: {
          brand_id: string
          created_at: string
          created_by: string | null
          dept_id: string | null
          email: string | null
          emp_code: string
          employment_status: string
          external_id: string | null
          external_source: string
          hire_date: string | null
          id: string
          is_active: boolean
          leave_date: string | null
          metadata: Json | null
          name: string
          national_id: string | null
          notes: string | null
          pay_rate: number | null
          phone: string | null
          position: string | null
          subsidiary_id: string | null
          synced_at: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          brand_id: string
          created_at?: string
          created_by?: string | null
          dept_id?: string | null
          email?: string | null
          emp_code: string
          employment_status?: string
          external_id?: string | null
          external_source?: string
          hire_date?: string | null
          id?: string
          is_active?: boolean
          leave_date?: string | null
          metadata?: Json | null
          name: string
          national_id?: string | null
          notes?: string | null
          pay_rate?: number | null
          phone?: string | null
          position?: string | null
          subsidiary_id?: string | null
          synced_at?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          brand_id?: string
          created_at?: string
          created_by?: string | null
          dept_id?: string | null
          email?: string | null
          emp_code?: string
          employment_status?: string
          external_id?: string | null
          external_source?: string
          hire_date?: string | null
          id?: string
          is_active?: boolean
          leave_date?: string | null
          metadata?: Json | null
          name?: string
          national_id?: string | null
          notes?: string | null
          pay_rate?: number | null
          phone?: string | null
          position?: string | null
          subsidiary_id?: string | null
          synced_at?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employees_dept_id_fkey"
            columns: ["dept_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_subsidiary_id_fkey"
            columns: ["subsidiary_id"]
            isOneToOne: false
            referencedRelation: "subsidiaries"
            referencedColumns: ["id"]
          },
        ]
      }
      feedback_canvas_snapshots: {
        Row: {
          brand_id: string
          metadata: Json | null
          snapshot: Json
          ticket_id: string
          updated_at: string
        }
        Insert: {
          brand_id?: string
          metadata?: Json | null
          snapshot?: Json
          ticket_id: string
          updated_at?: string
        }
        Update: {
          brand_id?: string
          metadata?: Json | null
          snapshot?: Json
          ticket_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "feedback_canvas_snapshots_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: true
            referencedRelation: "feedback_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      feedback_comment_attachments: {
        Row: {
          brand_id: string
          comment_id: string
          created_at: string
          file_name: string
          id: string
          metadata: Json | null
          mime_type: string | null
          size_bytes: number | null
          storage_path: string
          uploader_id: string | null
        }
        Insert: {
          brand_id?: string
          comment_id: string
          created_at?: string
          file_name: string
          id?: string
          metadata?: Json | null
          mime_type?: string | null
          size_bytes?: number | null
          storage_path: string
          uploader_id?: string | null
        }
        Update: {
          brand_id?: string
          comment_id?: string
          created_at?: string
          file_name?: string
          id?: string
          metadata?: Json | null
          mime_type?: string | null
          size_bytes?: number | null
          storage_path?: string
          uploader_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "feedback_comment_attachments_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "feedback_comments"
            referencedColumns: ["id"]
          },
        ]
      }
      feedback_comments: {
        Row: {
          author_id: string | null
          body: string
          brand_id: string
          created_at: string
          id: string
          metadata: Json | null
          parent_id: string | null
          ticket_id: string
        }
        Insert: {
          author_id?: string | null
          body: string
          brand_id?: string
          created_at?: string
          id?: string
          metadata?: Json | null
          parent_id?: string | null
          ticket_id: string
        }
        Update: {
          author_id?: string | null
          body?: string
          brand_id?: string
          created_at?: string
          id?: string
          metadata?: Json | null
          parent_id?: string | null
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "feedback_comments_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "feedback_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feedback_comments_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "feedback_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      feedback_tickets: {
        Row: {
          archived_at: string | null
          assignee_id: string | null
          brand_id: string
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          metadata: Json | null
          status: Database["public"]["Enums"]["feedback_status"]
          title: string
          updated_at: string
          url: string | null
        }
        Insert: {
          archived_at?: string | null
          assignee_id?: string | null
          brand_id?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          metadata?: Json | null
          status?: Database["public"]["Enums"]["feedback_status"]
          title: string
          updated_at?: string
          url?: string | null
        }
        Update: {
          archived_at?: string | null
          assignee_id?: string | null
          brand_id?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          metadata?: Json | null
          status?: Database["public"]["Enums"]["feedback_status"]
          title?: string
          updated_at?: string
          url?: string | null
        }
        Relationships: []
      }
      final_inspections: {
        Row: {
          brand_id: string
          cleaning: Json
          closed_at: string | null
          created_at: string
          created_by: string | null
          id: string
          inspection_no: string
          inspector_id: string | null
          inspector_name: string | null
          inspector_role: string | null
          issue_note: string | null
          line_results: Json
          metadata: Json
          next_service: Json
          notifications: Json
          repair_order_id: string
          signature_text: string | null
          signed_at: string | null
          signoff_note: string | null
          status: string
          test_drive: Json
          updated_at: string
        }
        Insert: {
          brand_id: string
          cleaning?: Json
          closed_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          inspection_no: string
          inspector_id?: string | null
          inspector_name?: string | null
          inspector_role?: string | null
          issue_note?: string | null
          line_results?: Json
          metadata?: Json
          next_service?: Json
          notifications?: Json
          repair_order_id: string
          signature_text?: string | null
          signed_at?: string | null
          signoff_note?: string | null
          status?: string
          test_drive?: Json
          updated_at?: string
        }
        Update: {
          brand_id?: string
          cleaning?: Json
          closed_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          inspection_no?: string
          inspector_id?: string | null
          inspector_name?: string | null
          inspector_role?: string | null
          issue_note?: string | null
          line_results?: Json
          metadata?: Json
          next_service?: Json
          notifications?: Json
          repair_order_id?: string
          signature_text?: string | null
          signed_at?: string | null
          signoff_note?: string | null
          status?: string
          test_drive?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "final_inspections_repair_order_id_fkey"
            columns: ["repair_order_id"]
            isOneToOne: true
            referencedRelation: "repair_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      followup_cases: {
        Row: {
          appointment_id: string | null
          brand_id: string
          case_no: string
          closed_at: string | null
          closed_reason: string | null
          created_at: string | null
          created_by: string | null
          customer_name: string | null
          estimated_fee: number
          id: string
          last_contacted_at: string | null
          metadata: Json | null
          next_contact_at: string | null
          recovered_amount: number
          sa_id: string | null
          sa_name: string | null
          safety_level: string
          source_addon_id: string
          source_ro_id: string | null
          status: string
          title: string
          updated_at: string | null
          vehicle_license_plate: string | null
          vehicle_model: string | null
        }
        Insert: {
          appointment_id?: string | null
          brand_id: string
          case_no: string
          closed_at?: string | null
          closed_reason?: string | null
          created_at?: string | null
          created_by?: string | null
          customer_name?: string | null
          estimated_fee?: number
          id?: string
          last_contacted_at?: string | null
          metadata?: Json | null
          next_contact_at?: string | null
          recovered_amount?: number
          sa_id?: string | null
          sa_name?: string | null
          safety_level?: string
          source_addon_id: string
          source_ro_id?: string | null
          status?: string
          title: string
          updated_at?: string | null
          vehicle_license_plate?: string | null
          vehicle_model?: string | null
        }
        Update: {
          appointment_id?: string | null
          brand_id?: string
          case_no?: string
          closed_at?: string | null
          closed_reason?: string | null
          created_at?: string | null
          created_by?: string | null
          customer_name?: string | null
          estimated_fee?: number
          id?: string
          last_contacted_at?: string | null
          metadata?: Json | null
          next_contact_at?: string | null
          recovered_amount?: number
          sa_id?: string | null
          sa_name?: string | null
          safety_level?: string
          source_addon_id?: string
          source_ro_id?: string | null
          status?: string
          title?: string
          updated_at?: string | null
          vehicle_license_plate?: string | null
          vehicle_model?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "followup_cases_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "followup_cases_source_addon_id_fkey"
            columns: ["source_addon_id"]
            isOneToOne: false
            referencedRelation: "repair_order_addons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "followup_cases_source_ro_id_fkey"
            columns: ["source_ro_id"]
            isOneToOne: false
            referencedRelation: "repair_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      followup_events: {
        Row: {
          acted_by: string | null
          acted_by_name: string | null
          body: string | null
          brand_id: string
          case_id: string
          created_at: string | null
          event_type: string
          id: string
          metadata: Json | null
          occurred_at: string
          outcome: string | null
        }
        Insert: {
          acted_by?: string | null
          acted_by_name?: string | null
          body?: string | null
          brand_id: string
          case_id: string
          created_at?: string | null
          event_type: string
          id?: string
          metadata?: Json | null
          occurred_at?: string
          outcome?: string | null
        }
        Update: {
          acted_by?: string | null
          acted_by_name?: string | null
          body?: string | null
          brand_id?: string
          case_id?: string
          created_at?: string | null
          event_type?: string
          id?: string
          metadata?: Json | null
          occurred_at?: string
          outcome?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "followup_events_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "followup_cases"
            referencedColumns: ["id"]
          },
        ]
      }
      gl_dimensions: {
        Row: {
          created_at: string
          description: string | null
          dimension_code: string
          dimension_name: string
          display_order: number
          id: string
          is_active: boolean
          is_required_globally: boolean
          is_system_default: boolean
          netsuite_segment_script_id: string | null
          netsuite_segment_type: string | null
          reference_table: string | null
          reference_value_column: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          dimension_code: string
          dimension_name: string
          display_order?: number
          id?: string
          is_active?: boolean
          is_required_globally?: boolean
          is_system_default?: boolean
          netsuite_segment_script_id?: string | null
          netsuite_segment_type?: string | null
          reference_table?: string | null
          reference_value_column?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          dimension_code?: string
          dimension_name?: string
          display_order?: number
          id?: string
          is_active?: boolean
          is_required_globally?: boolean
          is_system_default?: boolean
          netsuite_segment_script_id?: string | null
          netsuite_segment_type?: string | null
          reference_table?: string | null
          reference_value_column?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      global_search_index: {
        Row: {
          brand_id: string
          entity_id: string
          entity_type: string
          href: string
          id: string
          keywords: string
          subtitle: string | null
          title: string
          updated_at: string
        }
        Insert: {
          brand_id: string
          entity_id: string
          entity_type: string
          href: string
          id?: string
          keywords: string
          subtitle?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          brand_id?: string
          entity_id?: string
          entity_type?: string
          href?: string
          id?: string
          keywords?: string
          subtitle?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      group_brands: {
        Row: {
          brand_id: string
          effective_from: string | null
          group_id: string
        }
        Insert: {
          brand_id: string
          effective_from?: string | null
          group_id: string
        }
        Update: {
          brand_id?: string
          effective_from?: string | null
          group_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_brands_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_brands_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      groups: {
        Row: {
          created_at: string
          id: string
          name: string
          short_name: string | null
          tenant_uuid: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id: string
          name: string
          short_name?: string | null
          tenant_uuid?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          short_name?: string | null
          tenant_uuid?: string
          updated_at?: string
        }
        Relationships: []
      }
      inspection_findings: {
        Row: {
          brand_id: string
          category: string
          created_at: string
          id: string
          inspection_id: string
          item_label: string
          measurement: string | null
          metadata: Json | null
          notes: string | null
          photo_url: string | null
          status: string
          updated_at: string
        }
        Insert: {
          brand_id: string
          category: string
          created_at?: string
          id?: string
          inspection_id: string
          item_label: string
          measurement?: string | null
          metadata?: Json | null
          notes?: string | null
          photo_url?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          brand_id?: string
          category?: string
          created_at?: string
          id?: string
          inspection_id?: string
          item_label?: string
          measurement?: string | null
          metadata?: Json | null
          notes?: string | null
          photo_url?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inspection_findings_inspection_id_fkey"
            columns: ["inspection_id"]
            isOneToOne: false
            referencedRelation: "inspection_records"
            referencedColumns: ["id"]
          },
        ]
      }
      inspection_records: {
        Row: {
          appointment_id: string | null
          brand_id: string
          created_at: string
          created_by: string | null
          customer_signature_url: string | null
          id: string
          inspected_at: string
          inspector_id: string | null
          kind: string
          metadata: Json | null
          mileage_at_inspection: number | null
          notes: string | null
          overall_status: string
          updated_at: string
          vehicle_id: string
          work_order_id: string | null
        }
        Insert: {
          appointment_id?: string | null
          brand_id: string
          created_at?: string
          created_by?: string | null
          customer_signature_url?: string | null
          id?: string
          inspected_at?: string
          inspector_id?: string | null
          kind: string
          metadata?: Json | null
          mileage_at_inspection?: number | null
          notes?: string | null
          overall_status?: string
          updated_at?: string
          vehicle_id: string
          work_order_id?: string | null
        }
        Update: {
          appointment_id?: string | null
          brand_id?: string
          created_at?: string
          created_by?: string | null
          customer_signature_url?: string | null
          id?: string
          inspected_at?: string
          inspector_id?: string | null
          kind?: string
          metadata?: Json | null
          mileage_at_inspection?: number | null
          notes?: string | null
          overall_status?: string
          updated_at?: string
          vehicle_id?: string
          work_order_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inspection_records_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "service_appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inspection_records_inspector_id_fkey"
            columns: ["inspector_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inspection_records_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "customer_vehicles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inspection_records_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_adjustment_lines: {
        Row: {
          adj_id: string
          batch_no: string | null
          bin_id: string | null
          brand_id: string
          created_at: string | null
          id: string
          item_id: string
          line_amount: number
          line_no: number
          metadata: Json | null
          notes: string | null
          qty_delta: number
          serial_no: string | null
          unit_cost: number
        }
        Insert: {
          adj_id: string
          batch_no?: string | null
          bin_id?: string | null
          brand_id: string
          created_at?: string | null
          id?: string
          item_id: string
          line_amount?: number
          line_no: number
          metadata?: Json | null
          notes?: string | null
          qty_delta: number
          serial_no?: string | null
          unit_cost?: number
        }
        Update: {
          adj_id?: string
          batch_no?: string | null
          bin_id?: string | null
          brand_id?: string
          created_at?: string | null
          id?: string
          item_id?: string
          line_amount?: number
          line_no?: number
          metadata?: Json | null
          notes?: string | null
          qty_delta?: number
          serial_no?: string | null
          unit_cost?: number
        }
        Relationships: [
          {
            foreignKeyName: "inventory_adjustment_lines_adj_id_fkey"
            columns: ["adj_id"]
            isOneToOne: false
            referencedRelation: "inventory_adjustments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_adjustment_lines_bin_id_fkey"
            columns: ["bin_id"]
            isOneToOne: false
            referencedRelation: "warehouse_bins"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_adjustment_lines_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_adjustments: {
        Row: {
          adj_no: string
          approved_at: string | null
          approved_by: string | null
          brand_id: string
          created_at: string
          created_by: string | null
          ct_id: string | null
          gl_posted: boolean
          gl_posted_at: string | null
          id: string
          metadata: Json | null
          notes: string | null
          posted_at: string | null
          reason: string
          status: string
          total_amount: number
          type: string
          updated_at: string
          warehouse_id: string
        }
        Insert: {
          adj_no: string
          approved_at?: string | null
          approved_by?: string | null
          brand_id?: string
          created_at?: string
          created_by?: string | null
          ct_id?: string | null
          gl_posted?: boolean
          gl_posted_at?: string | null
          id?: string
          metadata?: Json | null
          notes?: string | null
          posted_at?: string | null
          reason: string
          status?: string
          total_amount?: number
          type: string
          updated_at?: string
          warehouse_id: string
        }
        Update: {
          adj_no?: string
          approved_at?: string | null
          approved_by?: string | null
          brand_id?: string
          created_at?: string
          created_by?: string | null
          ct_id?: string | null
          gl_posted?: boolean
          gl_posted_at?: string | null
          id?: string
          metadata?: Json | null
          notes?: string | null
          posted_at?: string | null
          reason?: string
          status?: string
          total_amount?: number
          type?: string
          updated_at?: string
          warehouse_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_adjustments_ct_id_fkey"
            columns: ["ct_id"]
            isOneToOne: false
            referencedRelation: "inventory_counts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_adjustments_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_count_lines: {
        Row: {
          bin_id: string | null
          brand_id: string
          created_at: string
          ct_id: string
          id: string
          item_id: string
          line_no: number
          metadata: Json | null
          notes: string | null
          qty_final: number | null
          qty_first_count: number | null
          qty_second_count: number | null
          qty_system: number
          status: string
          unit_cost: number | null
          updated_at: string
          variance: number | null
          variance_amount: number | null
        }
        Insert: {
          bin_id?: string | null
          brand_id?: string
          created_at?: string
          ct_id: string
          id?: string
          item_id: string
          line_no: number
          metadata?: Json | null
          notes?: string | null
          qty_final?: number | null
          qty_first_count?: number | null
          qty_second_count?: number | null
          qty_system?: number
          status?: string
          unit_cost?: number | null
          updated_at?: string
          variance?: number | null
          variance_amount?: number | null
        }
        Update: {
          bin_id?: string | null
          brand_id?: string
          created_at?: string
          ct_id?: string
          id?: string
          item_id?: string
          line_no?: number
          metadata?: Json | null
          notes?: string | null
          qty_final?: number | null
          qty_first_count?: number | null
          qty_second_count?: number | null
          qty_system?: number
          status?: string
          unit_cost?: number | null
          updated_at?: string
          variance?: number | null
          variance_amount?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_count_lines_bin_id_fkey"
            columns: ["bin_id"]
            isOneToOne: false
            referencedRelation: "warehouse_bins"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_count_lines_ct_id_fkey"
            columns: ["ct_id"]
            isOneToOne: false
            referencedRelation: "inventory_counts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_count_lines_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_count_plans: {
        Row: {
          abc_filter: string | null
          brand_id: string
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          last_run_at: string | null
          metadata: Json | null
          next_run_at: string | null
          notes: string | null
          plan_name: string
          plan_type: string
          schedule_cron: string | null
          updated_at: string
          warehouse_id: string
        }
        Insert: {
          abc_filter?: string | null
          brand_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          last_run_at?: string | null
          metadata?: Json | null
          next_run_at?: string | null
          notes?: string | null
          plan_name: string
          plan_type?: string
          schedule_cron?: string | null
          updated_at?: string
          warehouse_id: string
        }
        Update: {
          abc_filter?: string | null
          brand_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          last_run_at?: string | null
          metadata?: Json | null
          next_run_at?: string | null
          notes?: string | null
          plan_name?: string
          plan_type?: string
          schedule_cron?: string | null
          updated_at?: string
          warehouse_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_count_plans_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_counts: {
        Row: {
          approved_at: string | null
          approver_id: string | null
          brand_id: string
          count_date: string
          count_type: string
          created_at: string
          created_by: string | null
          ct_no: string
          first_counter_id: string | null
          freeze_warehouse: boolean
          id: string
          metadata: Json | null
          notes: string | null
          plan_id: string | null
          second_counter_id: string | null
          status: string
          total_lines: number
          updated_at: string
          variance_amount: number
          variance_lines: number
          warehouse_id: string
        }
        Insert: {
          approved_at?: string | null
          approver_id?: string | null
          brand_id?: string
          count_date?: string
          count_type?: string
          created_at?: string
          created_by?: string | null
          ct_no: string
          first_counter_id?: string | null
          freeze_warehouse?: boolean
          id?: string
          metadata?: Json | null
          notes?: string | null
          plan_id?: string | null
          second_counter_id?: string | null
          status?: string
          total_lines?: number
          updated_at?: string
          variance_amount?: number
          variance_lines?: number
          warehouse_id: string
        }
        Update: {
          approved_at?: string | null
          approver_id?: string | null
          brand_id?: string
          count_date?: string
          count_type?: string
          created_at?: string
          created_by?: string | null
          ct_no?: string
          first_counter_id?: string | null
          freeze_warehouse?: boolean
          id?: string
          metadata?: Json | null
          notes?: string | null
          plan_id?: string | null
          second_counter_id?: string | null
          status?: string
          total_lines?: number
          updated_at?: string
          variance_amount?: number
          variance_lines?: number
          warehouse_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_counts_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "inventory_count_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_counts_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      item_skus: {
        Row: {
          brand_id: string
          created_at: string
          id: string
          is_primary: boolean
          item_id: string
          metadata: Json | null
          notes: string | null
          sku_code: string
          sku_type: string
          spec: string | null
          supplier_id: string | null
          updated_at: string
        }
        Insert: {
          brand_id?: string
          created_at?: string
          id?: string
          is_primary?: boolean
          item_id: string
          metadata?: Json | null
          notes?: string | null
          sku_code: string
          sku_type: string
          spec?: string | null
          supplier_id?: string | null
          updated_at?: string
        }
        Update: {
          brand_id?: string
          created_at?: string
          id?: string
          is_primary?: boolean
          item_id?: string
          metadata?: Json | null
          notes?: string | null
          sku_code?: string
          sku_type?: string
          spec?: string | null
          supplier_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "item_skus_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "item_skus_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      item_store_prices: {
        Row: {
          brand_id: string
          created_at: string
          id: string
          is_active: boolean
          item_id: string
          metadata: Json | null
          notes: string | null
          org_id: string
          price: number
          pricing_type: string
          promo_end_date: string | null
          promo_start_date: string | null
          updated_at: string
        }
        Insert: {
          brand_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          item_id: string
          metadata?: Json | null
          notes?: string | null
          org_id: string
          price: number
          pricing_type?: string
          promo_end_date?: string | null
          promo_start_date?: string | null
          updated_at?: string
        }
        Update: {
          brand_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          item_id?: string
          metadata?: Json | null
          notes?: string | null
          org_id?: string
          price?: number
          pricing_type?: string
          promo_end_date?: string | null
          promo_start_date?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "item_store_prices_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "item_store_prices_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      item_vehicle_compatibility: {
        Row: {
          brand_id: string
          created_at: string
          id: string
          is_verified: boolean
          item_id: string
          metadata: Json | null
          notes: string | null
          updated_at: string
          vehicle_model_id: string
          year_end: number | null
          year_start: number | null
        }
        Insert: {
          brand_id?: string
          created_at?: string
          id?: string
          is_verified?: boolean
          item_id: string
          metadata?: Json | null
          notes?: string | null
          updated_at?: string
          vehicle_model_id: string
          year_end?: number | null
          year_start?: number | null
        }
        Update: {
          brand_id?: string
          created_at?: string
          id?: string
          is_verified?: boolean
          item_id?: string
          metadata?: Json | null
          notes?: string | null
          updated_at?: string
          vehicle_model_id?: string
          year_end?: number | null
          year_start?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "item_vehicle_compatibility_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "item_vehicle_compatibility_vehicle_model_id_fkey"
            columns: ["vehicle_model_id"]
            isOneToOne: false
            referencedRelation: "vehicle_models"
            referencedColumns: ["id"]
          },
        ]
      }
      items: {
        Row: {
          base_uom: string
          batch_tracking_required: boolean
          brand_id: string
          category: string | null
          code: string
          control_type: string
          created_at: string
          created_by: string | null
          default_lead_time_days: number | null
          default_supplier_id: string | null
          default_tax_code_id: string | null
          external_id: string | null
          external_source: string
          gl_cogs_coa_id: string | null
          gl_expense_coa_id: string | null
          gl_inventory_coa_id: string | null
          gl_revenue_coa_id: string | null
          id: string
          image_display_height: number
          image_url: string | null
          is_active: boolean
          metadata: Json | null
          name: string
          name_en: string | null
          serial_tracking_required: boolean
          shelf_life_months: number | null
          spec_description: string | null
          standard_cost: number | null
          suggested_price: number | null
          synced_at: string | null
          updated_at: string
          volume_cm3: number | null
          warranty_months: number | null
          weight_kg: number | null
        }
        Insert: {
          base_uom?: string
          batch_tracking_required?: boolean
          brand_id?: string
          category?: string | null
          code: string
          control_type?: string
          created_at?: string
          created_by?: string | null
          default_lead_time_days?: number | null
          default_supplier_id?: string | null
          default_tax_code_id?: string | null
          external_id?: string | null
          external_source?: string
          gl_cogs_coa_id?: string | null
          gl_expense_coa_id?: string | null
          gl_inventory_coa_id?: string | null
          gl_revenue_coa_id?: string | null
          id?: string
          image_display_height?: number
          image_url?: string | null
          is_active?: boolean
          metadata?: Json | null
          name: string
          name_en?: string | null
          serial_tracking_required?: boolean
          shelf_life_months?: number | null
          spec_description?: string | null
          standard_cost?: number | null
          suggested_price?: number | null
          synced_at?: string | null
          updated_at?: string
          volume_cm3?: number | null
          warranty_months?: number | null
          weight_kg?: number | null
        }
        Update: {
          base_uom?: string
          batch_tracking_required?: boolean
          brand_id?: string
          category?: string | null
          code?: string
          control_type?: string
          created_at?: string
          created_by?: string | null
          default_lead_time_days?: number | null
          default_supplier_id?: string | null
          default_tax_code_id?: string | null
          external_id?: string | null
          external_source?: string
          gl_cogs_coa_id?: string | null
          gl_expense_coa_id?: string | null
          gl_inventory_coa_id?: string | null
          gl_revenue_coa_id?: string | null
          id?: string
          image_display_height?: number
          image_url?: string | null
          is_active?: boolean
          metadata?: Json | null
          name?: string
          name_en?: string | null
          serial_tracking_required?: boolean
          shelf_life_months?: number | null
          spec_description?: string | null
          standard_cost?: number | null
          suggested_price?: number | null
          synced_at?: string | null
          updated_at?: string
          volume_cm3?: number | null
          warranty_months?: number | null
          weight_kg?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "items_default_supplier_id_fkey"
            columns: ["default_supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "items_default_tax_code_id_fkey"
            columns: ["default_tax_code_id"]
            isOneToOne: false
            referencedRelation: "tax_codes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "items_gl_cogs_coa_id_fkey"
            columns: ["gl_cogs_coa_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "items_gl_expense_coa_id_fkey"
            columns: ["gl_expense_coa_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "items_gl_inventory_coa_id_fkey"
            columns: ["gl_inventory_coa_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "items_gl_revenue_coa_id_fkey"
            columns: ["gl_revenue_coa_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_entries: {
        Row: {
          cash_flow_section: string | null
          created_at: string
          created_by: string | null
          description: string | null
          entry_date: string
          entry_no: string
          id: string
          metadata: Json | null
          netsuite_journal_id: string | null
          netsuite_synced_at: string | null
          period_id: string | null
          posted_at: string | null
          posted_by: string | null
          reversed_by_entry_id: string | null
          status: string
          tenant_id: string
          transaction_type_id: string | null
          updated_at: string
        }
        Insert: {
          cash_flow_section?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          entry_date: string
          entry_no: string
          id?: string
          metadata?: Json | null
          netsuite_journal_id?: string | null
          netsuite_synced_at?: string | null
          period_id?: string | null
          posted_at?: string | null
          posted_by?: string | null
          reversed_by_entry_id?: string | null
          status?: string
          tenant_id: string
          transaction_type_id?: string | null
          updated_at?: string
        }
        Update: {
          cash_flow_section?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          entry_date?: string
          entry_no?: string
          id?: string
          metadata?: Json | null
          netsuite_journal_id?: string | null
          netsuite_synced_at?: string | null
          period_id?: string | null
          posted_at?: string | null
          posted_by?: string | null
          reversed_by_entry_id?: string | null
          status?: string
          tenant_id?: string
          transaction_type_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "journal_entries_period_id_fkey"
            columns: ["period_id"]
            isOneToOne: false
            referencedRelation: "accounting_periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entries_reversed_by_entry_id_fkey"
            columns: ["reversed_by_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entries_transaction_type_id_fkey"
            columns: ["transaction_type_id"]
            isOneToOne: false
            referencedRelation: "transaction_types"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_entry_lines: {
        Row: {
          coa_id: string
          created_at: string
          credit: number
          debit: number
          description: string | null
          dimensions: Json
          entry_id: string
          id: string
          line_no: number
          metadata: Json | null
        }
        Insert: {
          coa_id: string
          created_at?: string
          credit?: number
          debit?: number
          description?: string | null
          dimensions?: Json
          entry_id: string
          id?: string
          line_no: number
          metadata?: Json | null
        }
        Update: {
          coa_id?: string
          created_at?: string
          credit?: number
          debit?: number
          description?: string | null
          dimensions?: Json
          entry_id?: string
          id?: string
          line_no?: number
          metadata?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "journal_entry_lines_coa_id_fkey"
            columns: ["coa_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entry_lines_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      nav_nodes: {
        Row: {
          accent: string | null
          badge: string | null
          brand_id: string
          coming_soon: boolean
          created_at: string
          created_by: string | null
          description: string | null
          device: string | null
          emoji: string | null
          home: string | null
          href: string | null
          html_storage_path: string | null
          icon: string | null
          id: string
          is_active: boolean
          is_admin_only: boolean
          level: number
          module_key: string | null
          name: string
          page_kind: string | null
          parent_id: string | null
          permission: string | null
          section_group: string | null
          section_group_color: string | null
          sort_order: number
          sprint: string | null
          stitch_screen_id: string | null
          updated_at: string
        }
        Insert: {
          accent?: string | null
          badge?: string | null
          brand_id: string
          coming_soon?: boolean
          created_at?: string
          created_by?: string | null
          description?: string | null
          device?: string | null
          emoji?: string | null
          home?: string | null
          href?: string | null
          html_storage_path?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean
          is_admin_only?: boolean
          level: number
          module_key?: string | null
          name: string
          page_kind?: string | null
          parent_id?: string | null
          permission?: string | null
          section_group?: string | null
          section_group_color?: string | null
          sort_order?: number
          sprint?: string | null
          stitch_screen_id?: string | null
          updated_at?: string
        }
        Update: {
          accent?: string | null
          badge?: string | null
          brand_id?: string
          coming_soon?: boolean
          created_at?: string
          created_by?: string | null
          description?: string | null
          device?: string | null
          emoji?: string | null
          home?: string | null
          href?: string | null
          html_storage_path?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean
          is_admin_only?: boolean
          level?: number
          module_key?: string | null
          name?: string
          page_kind?: string | null
          parent_id?: string | null
          permission?: string | null
          section_group?: string | null
          section_group_color?: string | null
          sort_order?: number
          sprint?: string | null
          stitch_screen_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "nav_nodes_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "nav_nodes"
            referencedColumns: ["id"]
          },
        ]
      }
      netsuite_dim_mapping: {
        Row: {
          created_at: string
          dealeros_dim: string
          dealeros_id: string
          id: string
          netsuite_external_id: string | null
          netsuite_internal_id: string
          netsuite_segment_script_id: string | null
          netsuite_segment_type: string | null
          sync_notes: string | null
          sync_status: string
          synced_at: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          dealeros_dim: string
          dealeros_id: string
          id?: string
          netsuite_external_id?: string | null
          netsuite_internal_id: string
          netsuite_segment_script_id?: string | null
          netsuite_segment_type?: string | null
          sync_notes?: string | null
          sync_status?: string
          synced_at?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          dealeros_dim?: string
          dealeros_id?: string
          id?: string
          netsuite_external_id?: string | null
          netsuite_internal_id?: string
          netsuite_segment_script_id?: string | null
          netsuite_segment_type?: string | null
          sync_notes?: string | null
          sync_status?: string
          synced_at?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      new_car_inventory: {
        Row: {
          arrival_date: string | null
          brand_id: string
          build_date: string | null
          color: string | null
          color_hex: string | null
          config: Json | null
          cost_price: number | null
          created_at: string
          created_by: string | null
          delivered_date: string | null
          displayed_date: string | null
          engine_no: string | null
          external_id: string | null
          id: string
          images: string[] | null
          license_plate_no: string | null
          license_plate_status: string
          linked_sales_order_id: string | null
          list_price: number | null
          metadata: Json | null
          note: string | null
          organization_id: string | null
          reserved_date: string | null
          sold_date: string | null
          status: string
          subsidiary_id: string | null
          updated_at: string
          updated_by: string | null
          vehicle_model_id: string | null
          vin: string | null
          year: number | null
        }
        Insert: {
          arrival_date?: string | null
          brand_id: string
          build_date?: string | null
          color?: string | null
          color_hex?: string | null
          config?: Json | null
          cost_price?: number | null
          created_at?: string
          created_by?: string | null
          delivered_date?: string | null
          displayed_date?: string | null
          engine_no?: string | null
          external_id?: string | null
          id?: string
          images?: string[] | null
          license_plate_no?: string | null
          license_plate_status?: string
          linked_sales_order_id?: string | null
          list_price?: number | null
          metadata?: Json | null
          note?: string | null
          organization_id?: string | null
          reserved_date?: string | null
          sold_date?: string | null
          status?: string
          subsidiary_id?: string | null
          updated_at?: string
          updated_by?: string | null
          vehicle_model_id?: string | null
          vin?: string | null
          year?: number | null
        }
        Update: {
          arrival_date?: string | null
          brand_id?: string
          build_date?: string | null
          color?: string | null
          color_hex?: string | null
          config?: Json | null
          cost_price?: number | null
          created_at?: string
          created_by?: string | null
          delivered_date?: string | null
          displayed_date?: string | null
          engine_no?: string | null
          external_id?: string | null
          id?: string
          images?: string[] | null
          license_plate_no?: string | null
          license_plate_status?: string
          linked_sales_order_id?: string | null
          list_price?: number | null
          metadata?: Json | null
          note?: string | null
          organization_id?: string | null
          reserved_date?: string | null
          sold_date?: string | null
          status?: string
          subsidiary_id?: string | null
          updated_at?: string
          updated_by?: string | null
          vehicle_model_id?: string | null
          vin?: string | null
          year?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "new_car_inventory_linked_sales_order_id_fkey"
            columns: ["linked_sales_order_id"]
            isOneToOne: false
            referencedRelation: "sales_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "new_car_inventory_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "new_car_inventory_subsidiary_id_fkey"
            columns: ["subsidiary_id"]
            isOneToOne: false
            referencedRelation: "subsidiaries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "new_car_inventory_vehicle_model_id_fkey"
            columns: ["vehicle_model_id"]
            isOneToOne: false
            referencedRelation: "vehicle_models"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_automation_rules: {
        Row: {
          brand_id: string
          channel: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          kind: string
          metadata: Json
          name: string
          template_id: string | null
          trigger_config: Json
          trigger_event: string
          updated_at: string
        }
        Insert: {
          brand_id: string
          channel: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          kind: string
          metadata?: Json
          name: string
          template_id?: string | null
          trigger_config?: Json
          trigger_event: string
          updated_at?: string
        }
        Update: {
          brand_id?: string
          channel?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          kind?: string
          metadata?: Json
          name?: string
          template_id?: string | null
          trigger_config?: Json
          trigger_event?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_automation_rules_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "push_message_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_channels: {
        Row: {
          code: string
          config: Json
          created_at: string
          display_name: string
          id: string
          is_active: boolean
          updated_at: string
        }
        Insert: {
          code: string
          config?: Json
          created_at?: string
          display_name: string
          id?: string
          is_active?: boolean
          updated_at?: string
        }
        Update: {
          code?: string
          config?: Json
          created_at?: string
          display_name?: string
          id?: string
          is_active?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      notification_deliveries: {
        Row: {
          attempts: number
          brand_id: string
          channel_code: string
          created_at: string
          event_code: string
          event_payload: Json
          id: string
          last_error: string | null
          rendered_body: Json | null
          sent_at: string | null
          status: string
          subscription_id: string | null
          target_ref: string
          template_code: string | null
          updated_at: string
        }
        Insert: {
          attempts?: number
          brand_id?: string
          channel_code: string
          created_at?: string
          event_code: string
          event_payload: Json
          id?: string
          last_error?: string | null
          rendered_body?: Json | null
          sent_at?: string | null
          status: string
          subscription_id?: string | null
          target_ref: string
          template_code?: string | null
          updated_at?: string
        }
        Update: {
          attempts?: number
          brand_id?: string
          channel_code?: string
          created_at?: string
          event_code?: string
          event_payload?: Json
          id?: string
          last_error?: string | null
          rendered_body?: Json | null
          sent_at?: string | null
          status?: string
          subscription_id?: string | null
          target_ref?: string
          template_code?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_deliveries_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "notification_subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_subscriptions: {
        Row: {
          brand_id: string
          created_at: string
          event_code: string
          filter_rules: Json
          id: string
          is_active: boolean
          module: string
          target_id: string
          template_code: string | null
          updated_at: string
        }
        Insert: {
          brand_id?: string
          created_at?: string
          event_code: string
          filter_rules?: Json
          id?: string
          is_active?: boolean
          module?: string
          target_id: string
          template_code?: string | null
          updated_at?: string
        }
        Update: {
          brand_id?: string
          created_at?: string
          event_code?: string
          filter_rules?: Json
          id?: string
          is_active?: boolean
          module?: string
          target_id?: string
          template_code?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_subscriptions_target_id_fkey"
            columns: ["target_id"]
            isOneToOne: false
            referencedRelation: "notification_targets"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_target_candidates: {
        Row: {
          brand_id: string
          channel_code: string
          created_at: string
          discovered_via: string
          dismissed_at: string | null
          display_name: string | null
          id: string
          last_message_text: string | null
          last_seen_at: string
          message_count: number
          promoted_target_id: string | null
          source_user_id: string | null
          target_ref: string
          target_type: string
          updated_at: string
        }
        Insert: {
          brand_id?: string
          channel_code: string
          created_at?: string
          discovered_via: string
          dismissed_at?: string | null
          display_name?: string | null
          id?: string
          last_message_text?: string | null
          last_seen_at?: string
          message_count?: number
          promoted_target_id?: string | null
          source_user_id?: string | null
          target_ref: string
          target_type: string
          updated_at?: string
        }
        Update: {
          brand_id?: string
          channel_code?: string
          created_at?: string
          discovered_via?: string
          dismissed_at?: string | null
          display_name?: string | null
          id?: string
          last_message_text?: string | null
          last_seen_at?: string
          message_count?: number
          promoted_target_id?: string | null
          source_user_id?: string | null
          target_ref?: string
          target_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_target_candidates_promoted_target_id_fkey"
            columns: ["promoted_target_id"]
            isOneToOne: false
            referencedRelation: "notification_targets"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_targets: {
        Row: {
          brand_id: string
          channel_id: string
          created_at: string
          display_name: string
          id: string
          is_active: boolean
          metadata: Json
          target_ref: string
          target_type: string
          updated_at: string
        }
        Insert: {
          brand_id?: string
          channel_id: string
          created_at?: string
          display_name: string
          id?: string
          is_active?: boolean
          metadata?: Json
          target_ref: string
          target_type: string
          updated_at?: string
        }
        Update: {
          brand_id?: string
          channel_id?: string
          created_at?: string
          display_name?: string
          id?: string
          is_active?: boolean
          metadata?: Json
          target_ref?: string
          target_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_targets_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "notification_channels"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_templates: {
        Row: {
          body: Json
          channel_code: string
          code: string
          created_at: string
          description: string | null
          event_code: string
          format: string
          id: string
          is_active: boolean
          updated_at: string
        }
        Insert: {
          body: Json
          channel_code: string
          code: string
          created_at?: string
          description?: string | null
          event_code: string
          format: string
          id?: string
          is_active?: boolean
          updated_at?: string
        }
        Update: {
          body?: Json
          channel_code?: string
          code?: string
          created_at?: string
          description?: string | null
          event_code?: string
          format?: string
          id?: string
          is_active?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      nps_responses: {
        Row: {
          brand_id: string
          call_task_id: string | null
          category: string | null
          comment: string | null
          created_at: string
          customer_id: string | null
          id: string
          kind: string
          metadata: Json
          responded_at: string
          sales_person: string | null
          score: number
          store_id: string | null
          survey_template_id: string | null
        }
        Insert: {
          brand_id: string
          call_task_id?: string | null
          category?: string | null
          comment?: string | null
          created_at?: string
          customer_id?: string | null
          id?: string
          kind: string
          metadata?: Json
          responded_at?: string
          sales_person?: string | null
          score: number
          store_id?: string | null
          survey_template_id?: string | null
        }
        Update: {
          brand_id?: string
          call_task_id?: string | null
          category?: string | null
          comment?: string | null
          created_at?: string
          customer_id?: string | null
          id?: string
          kind?: string
          metadata?: Json
          responded_at?: string
          sales_person?: string | null
          score?: number
          store_id?: string | null
          survey_template_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "nps_responses_call_task_id_fkey"
            columns: ["call_task_id"]
            isOneToOne: false
            referencedRelation: "call_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nps_responses_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nps_responses_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nps_responses_survey_template_id_fkey"
            columns: ["survey_template_id"]
            isOneToOne: false
            referencedRelation: "survey_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      old_parts: {
        Row: {
          bin_id: string | null
          brand_id: string
          cl_id: string | null
          created_at: string
          created_by: string | null
          disposal_action: string | null
          disposed_at: string | null
          disposed_by: string | null
          entry_date: string
          expiry_date: string | null
          id: string
          item_id: string
          metadata: Json | null
          notes: string | null
          ro_id: string | null
          serial_no: string | null
          status: string
          updated_at: string
          vin: string | null
          warehouse_id: string | null
          wc_no: string
        }
        Insert: {
          bin_id?: string | null
          brand_id?: string
          cl_id?: string | null
          created_at?: string
          created_by?: string | null
          disposal_action?: string | null
          disposed_at?: string | null
          disposed_by?: string | null
          entry_date?: string
          expiry_date?: string | null
          id?: string
          item_id: string
          metadata?: Json | null
          notes?: string | null
          ro_id?: string | null
          serial_no?: string | null
          status?: string
          updated_at?: string
          vin?: string | null
          warehouse_id?: string | null
          wc_no: string
        }
        Update: {
          bin_id?: string | null
          brand_id?: string
          cl_id?: string | null
          created_at?: string
          created_by?: string | null
          disposal_action?: string | null
          disposed_at?: string | null
          disposed_by?: string | null
          entry_date?: string
          expiry_date?: string | null
          id?: string
          item_id?: string
          metadata?: Json | null
          notes?: string | null
          ro_id?: string | null
          serial_no?: string | null
          status?: string
          updated_at?: string
          vin?: string | null
          warehouse_id?: string | null
          wc_no?: string
        }
        Relationships: [
          {
            foreignKeyName: "old_parts_bin_id_fkey"
            columns: ["bin_id"]
            isOneToOne: false
            referencedRelation: "warehouse_bins"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "old_parts_cl_id_fkey"
            columns: ["cl_id"]
            isOneToOne: false
            referencedRelation: "warranty_claims"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "old_parts_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "old_parts_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          address: string | null
          bank_account: string | null
          brand_id: string
          code: string
          created_at: string
          created_by: string | null
          external_id: string | null
          external_source: string
          group_id: string
          id: string
          is_active: boolean
          level: number
          manager_user_id: string | null
          metadata: Json | null
          name: string
          netsuite_location_id: string | null
          netsuite_synced_at: string | null
          notes: string | null
          parent_id: string | null
          phone: string | null
          responsible_person: string | null
          short_name: string | null
          store_type: string | null
          subsidiary_id: string
          synced_at: string | null
          type: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          bank_account?: string | null
          brand_id?: string
          code: string
          created_at?: string
          created_by?: string | null
          external_id?: string | null
          external_source?: string
          group_id: string
          id?: string
          is_active?: boolean
          level: number
          manager_user_id?: string | null
          metadata?: Json | null
          name: string
          netsuite_location_id?: string | null
          netsuite_synced_at?: string | null
          notes?: string | null
          parent_id?: string | null
          phone?: string | null
          responsible_person?: string | null
          short_name?: string | null
          store_type?: string | null
          subsidiary_id: string
          synced_at?: string | null
          type: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          bank_account?: string | null
          brand_id?: string
          code?: string
          created_at?: string
          created_by?: string | null
          external_id?: string | null
          external_source?: string
          group_id?: string
          id?: string
          is_active?: boolean
          level?: number
          manager_user_id?: string | null
          metadata?: Json | null
          name?: string
          netsuite_location_id?: string | null
          netsuite_synced_at?: string | null
          notes?: string | null
          parent_id?: string | null
          phone?: string | null
          responsible_person?: string | null
          short_name?: string | null
          store_type?: string | null
          subsidiary_id?: string
          synced_at?: string | null
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organizations_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organizations_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organizations_subsidiary_id_fkey"
            columns: ["subsidiary_id"]
            isOneToOne: false
            referencedRelation: "subsidiaries"
            referencedColumns: ["id"]
          },
        ]
      }
      parts_alert_escalation_rules: {
        Row: {
          alert_icon: string | null
          alert_label: string
          alert_priority: string
          alert_type: string
          brand_id: string
          channel_email: boolean
          channel_push: boolean
          channel_sms: boolean
          created_at: string
          delay_minutes: number
          id: string
          is_active: boolean
          metadata: Json | null
          recipient_label: string | null
          sort_order: number
          tier: number
          tier_label: string
          trigger_desc: string | null
          updated_at: string
        }
        Insert: {
          alert_icon?: string | null
          alert_label: string
          alert_priority?: string
          alert_type: string
          brand_id: string
          channel_email?: boolean
          channel_push?: boolean
          channel_sms?: boolean
          created_at?: string
          delay_minutes?: number
          id?: string
          is_active?: boolean
          metadata?: Json | null
          recipient_label?: string | null
          sort_order?: number
          tier: number
          tier_label: string
          trigger_desc?: string | null
          updated_at?: string
        }
        Update: {
          alert_icon?: string | null
          alert_label?: string
          alert_priority?: string
          alert_type?: string
          brand_id?: string
          channel_email?: boolean
          channel_push?: boolean
          channel_sms?: boolean
          created_at?: string
          delay_minutes?: number
          id?: string
          is_active?: boolean
          metadata?: Json | null
          recipient_label?: string | null
          sort_order?: number
          tier?: number
          tier_label?: string
          trigger_desc?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      parts_alert_receivers: {
        Row: {
          avatar_color: string
          brand_id: string
          created_at: string
          default_email: boolean
          default_push: boolean
          default_sms: boolean
          display_name: string
          id: string
          is_active: boolean
          metadata: Json | null
          role_label: string | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          avatar_color?: string
          brand_id: string
          created_at?: string
          default_email?: boolean
          default_push?: boolean
          default_sms?: boolean
          display_name: string
          id?: string
          is_active?: boolean
          metadata?: Json | null
          role_label?: string | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          avatar_color?: string
          brand_id?: string
          created_at?: string
          default_email?: boolean
          default_push?: boolean
          default_sms?: boolean
          display_name?: string
          id?: string
          is_active?: boolean
          metadata?: Json | null
          role_label?: string | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      parts_dictionary: {
        Row: {
          accent_color: string | null
          brand_id: string
          code: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          kind: string
          label: string
          metadata: Json | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          accent_color?: string | null
          brand_id: string
          code: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          kind: string
          label: string
          metadata?: Json | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          accent_color?: string | null
          brand_id?: string
          code?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          kind?: string
          label?: string
          metadata?: Json | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      parts_internal_sale_issues: {
        Row: {
          amount_total: number
          brand_id: string
          created_at: string
          customer_label: string | null
          doc_no: string
          id: string
          issue_date: string | null
          metadata: Json | null
          notes: string | null
          qty_total: number
          sort_order: number
          status: string
          updated_at: string
          warehouse_label: string | null
        }
        Insert: {
          amount_total?: number
          brand_id: string
          created_at?: string
          customer_label?: string | null
          doc_no: string
          id?: string
          issue_date?: string | null
          metadata?: Json | null
          notes?: string | null
          qty_total?: number
          sort_order?: number
          status?: string
          updated_at?: string
          warehouse_label?: string | null
        }
        Update: {
          amount_total?: number
          brand_id?: string
          created_at?: string
          customer_label?: string | null
          doc_no?: string
          id?: string
          issue_date?: string | null
          metadata?: Json | null
          notes?: string | null
          qty_total?: number
          sort_order?: number
          status?: string
          updated_at?: string
          warehouse_label?: string | null
        }
        Relationships: []
      }
      parts_internal_sale_receipts: {
        Row: {
          amount_total: number
          brand_id: string
          created_at: string
          doc_no: string
          id: string
          metadata: Json | null
          notes: string | null
          qty_total: number
          receipt_date: string | null
          sort_order: number
          source_label: string | null
          status: string
          updated_at: string
          warehouse_label: string | null
        }
        Insert: {
          amount_total?: number
          brand_id: string
          created_at?: string
          doc_no: string
          id?: string
          metadata?: Json | null
          notes?: string | null
          qty_total?: number
          receipt_date?: string | null
          sort_order?: number
          source_label?: string | null
          status?: string
          updated_at?: string
          warehouse_label?: string | null
        }
        Update: {
          amount_total?: number
          brand_id?: string
          created_at?: string
          doc_no?: string
          id?: string
          metadata?: Json | null
          notes?: string | null
          qty_total?: number
          receipt_date?: string | null
          sort_order?: number
          source_label?: string | null
          status?: string
          updated_at?: string
          warehouse_label?: string | null
        }
        Relationships: []
      }
      parts_warranty_claim_types: {
        Row: {
          accent: string
          brand_id: string
          code: string
          created_at: string
          description: string
          icon: string
          id: string
          is_active: boolean
          label: string
          metadata: Json
          sort_order: number
          updated_at: string
        }
        Insert: {
          accent?: string
          brand_id: string
          code: string
          created_at?: string
          description?: string
          icon?: string
          id?: string
          is_active?: boolean
          label: string
          metadata?: Json
          sort_order?: number
          updated_at?: string
        }
        Update: {
          accent?: string
          brand_id?: string
          code?: string
          created_at?: string
          description?: string
          icon?: string
          id?: string
          is_active?: boolean
          label?: string
          metadata?: Json
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      parts_warranty_claims: {
        Row: {
          apply_amount: number
          approved_amount: number
          brand_id: string
          claim_no: string
          created_at: string
          expected_pay_date: string | null
          hours_label: string | null
          id: string
          item_label: string
          metadata: Json | null
          ro_no: string | null
          sort_order: number
          status: string
          status_label: string | null
          updated_at: string
          warranty_type: string | null
        }
        Insert: {
          apply_amount?: number
          approved_amount?: number
          brand_id: string
          claim_no: string
          created_at?: string
          expected_pay_date?: string | null
          hours_label?: string | null
          id?: string
          item_label: string
          metadata?: Json | null
          ro_no?: string | null
          sort_order?: number
          status?: string
          status_label?: string | null
          updated_at?: string
          warranty_type?: string | null
        }
        Update: {
          apply_amount?: number
          approved_amount?: number
          brand_id?: string
          claim_no?: string
          created_at?: string
          expected_pay_date?: string | null
          hours_label?: string | null
          id?: string
          item_label?: string
          metadata?: Json | null
          ro_no?: string | null
          sort_order?: number
          status?: string
          status_label?: string | null
          updated_at?: string
          warranty_type?: string | null
        }
        Relationships: []
      }
      parts_warranty_cost_recovery_config: {
        Row: {
          alert_on_overdue: boolean
          auto_settle_cost: boolean
          brand_id: string
          created_at: string
          metadata: Json | null
          monthly_report_auto: boolean
          monthly_report_to_manager: boolean
          remind_7_days_before: boolean
          sync_finance_system: boolean
          updated_at: string
        }
        Insert: {
          alert_on_overdue?: boolean
          auto_settle_cost?: boolean
          brand_id: string
          created_at?: string
          metadata?: Json | null
          monthly_report_auto?: boolean
          monthly_report_to_manager?: boolean
          remind_7_days_before?: boolean
          sync_finance_system?: boolean
          updated_at?: string
        }
        Update: {
          alert_on_overdue?: boolean
          auto_settle_cost?: boolean
          brand_id?: string
          created_at?: string
          metadata?: Json | null
          monthly_report_auto?: boolean
          monthly_report_to_manager?: boolean
          remind_7_days_before?: boolean
          sync_finance_system?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      parts_warranty_flow_config: {
        Row: {
          banner_enabled: boolean
          banner_text: string
          brand_id: string
          created_at: string
          metadata: Json
          updated_at: string
        }
        Insert: {
          banner_enabled?: boolean
          banner_text?: string
          brand_id: string
          created_at?: string
          metadata?: Json
          updated_at?: string
        }
        Update: {
          banner_enabled?: boolean
          banner_text?: string
          brand_id?: string
          created_at?: string
          metadata?: Json
          updated_at?: string
        }
        Relationships: []
      }
      parts_warranty_flow_steps: {
        Row: {
          brand_id: string
          created_at: string
          description: string
          id: string
          is_active: boolean
          is_terminal: boolean
          metadata: Json
          sort_order: number
          step_no: number
          title: string
          updated_at: string
        }
        Insert: {
          brand_id: string
          created_at?: string
          description?: string
          id?: string
          is_active?: boolean
          is_terminal?: boolean
          metadata?: Json
          sort_order?: number
          step_no: number
          title: string
          updated_at?: string
        }
        Update: {
          brand_id?: string
          created_at?: string
          description?: string
          id?: string
          is_active?: boolean
          is_terminal?: boolean
          metadata?: Json
          sort_order?: number
          step_no?: number
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      parts_warranty_ro_link_config: {
        Row: {
          brand_id: string
          created_at: string
          dms_connected: boolean
          dms_endpoint: string | null
          dms_label: string | null
          expiry_alert_days: number
          fallback_action: string
          metadata: Json | null
          sync_estimate: boolean
          sync_frequency: string
          sync_ro_to_issue: boolean
          sync_technician: boolean
          sync_vin_check: boolean
          sync_warranty_label: boolean
          updated_at: string
        }
        Insert: {
          brand_id: string
          created_at?: string
          dms_connected?: boolean
          dms_endpoint?: string | null
          dms_label?: string | null
          expiry_alert_days?: number
          fallback_action?: string
          metadata?: Json | null
          sync_estimate?: boolean
          sync_frequency?: string
          sync_ro_to_issue?: boolean
          sync_technician?: boolean
          sync_vin_check?: boolean
          sync_warranty_label?: boolean
          updated_at?: string
        }
        Update: {
          brand_id?: string
          created_at?: string
          dms_connected?: boolean
          dms_endpoint?: string | null
          dms_label?: string | null
          expiry_alert_days?: number
          fallback_action?: string
          metadata?: Json | null
          sync_estimate?: boolean
          sync_frequency?: string
          sync_ro_to_issue?: boolean
          sync_technician?: boolean
          sync_vin_check?: boolean
          sync_warranty_label?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      parts_warranty_ro_link_records: {
        Row: {
          brand_id: string
          claim_no: string | null
          created_at: string
          id: string
          metadata: Json | null
          model: string | null
          out_no: string | null
          ro_no: string
          sort_order: number
          sync_status: string
          sync_status_label: string | null
          updated_at: string
          vin: string | null
          warranty_type: string | null
        }
        Insert: {
          brand_id: string
          claim_no?: string | null
          created_at?: string
          id?: string
          metadata?: Json | null
          model?: string | null
          out_no?: string | null
          ro_no: string
          sort_order?: number
          sync_status?: string
          sync_status_label?: string | null
          updated_at?: string
          vin?: string | null
          warranty_type?: string | null
        }
        Update: {
          brand_id?: string
          claim_no?: string | null
          created_at?: string
          id?: string
          metadata?: Json | null
          model?: string | null
          out_no?: string | null
          ro_no?: string
          sort_order?: number
          sync_status?: string
          sync_status_label?: string | null
          updated_at?: string
          vin?: string | null
          warranty_type?: string | null
        }
        Relationships: []
      }
      parts_warranty_staging_rules: {
        Row: {
          alert_days_escalate: number
          alert_days_first: number
          allow_temp_borrow: boolean
          brand_id: string
          cost_calc_method: string
          created_at: string
          exclude_from_alerts: boolean
          exclude_from_count: boolean
          isolate_from_sellable: boolean
          metadata: Json | null
          updated_at: string
        }
        Insert: {
          alert_days_escalate?: number
          alert_days_first?: number
          allow_temp_borrow?: boolean
          brand_id: string
          cost_calc_method?: string
          created_at?: string
          exclude_from_alerts?: boolean
          exclude_from_count?: boolean
          isolate_from_sellable?: boolean
          metadata?: Json | null
          updated_at?: string
        }
        Update: {
          alert_days_escalate?: number
          alert_days_first?: number
          allow_temp_borrow?: boolean
          brand_id?: string
          cost_calc_method?: string
          created_at?: string
          exclude_from_alerts?: boolean
          exclude_from_count?: boolean
          isolate_from_sellable?: boolean
          metadata?: Json | null
          updated_at?: string
        }
        Relationships: []
      }
      parts_warranty_timing_rules: {
        Row: {
          apply_window: string
          brand_id: string
          claim_type_id: string
          close_goal_days: number
          created_at: string
          id: string
          is_active: boolean
          metadata: Json
          storage_rule: string
          updated_at: string
        }
        Insert: {
          apply_window?: string
          brand_id: string
          claim_type_id: string
          close_goal_days?: number
          created_at?: string
          id?: string
          is_active?: boolean
          metadata?: Json
          storage_rule?: string
          updated_at?: string
        }
        Update: {
          apply_window?: string
          brand_id?: string
          claim_type_id?: string
          close_goal_days?: number
          created_at?: string
          id?: string
          is_active?: boolean
          metadata?: Json
          storage_rule?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "parts_warranty_timing_rules_claim_type_id_fkey"
            columns: ["claim_type_id"]
            isOneToOne: true
            referencedRelation: "parts_warranty_claim_types"
            referencedColumns: ["id"]
          },
        ]
      }
      parts_warranty_used_parts_config: {
        Row: {
          auto_link_cost_recovery: boolean
          auto_update_claim: boolean
          brand_id: string
          created_at: string
          inbound_warehouse: string
          metadata: Json | null
          trigger_auto_barcode: boolean
          trigger_auto_reserve: boolean
          trigger_manual_no_serial: boolean
          trigger_require_photo: boolean
          trigger_scan_inbound: boolean
          updated_at: string
        }
        Insert: {
          auto_link_cost_recovery?: boolean
          auto_update_claim?: boolean
          brand_id: string
          created_at?: string
          inbound_warehouse?: string
          metadata?: Json | null
          trigger_auto_barcode?: boolean
          trigger_auto_reserve?: boolean
          trigger_manual_no_serial?: boolean
          trigger_require_photo?: boolean
          trigger_scan_inbound?: boolean
          updated_at?: string
        }
        Update: {
          auto_link_cost_recovery?: boolean
          auto_update_claim?: boolean
          brand_id?: string
          created_at?: string
          inbound_warehouse?: string
          metadata?: Json | null
          trigger_auto_barcode?: boolean
          trigger_auto_reserve?: boolean
          trigger_manual_no_serial?: boolean
          trigger_require_photo?: boolean
          trigger_scan_inbound?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      parts_warranty_used_parts_items: {
        Row: {
          barcode: string
          brand_id: string
          created_at: string
          damage_label: string | null
          damage_level: string
          id: string
          inbound_date: string | null
          item_code: string | null
          item_name: string
          metadata: Json | null
          ro_no: string | null
          sort_order: number
          status: string
          status_label: string | null
          updated_at: string
        }
        Insert: {
          barcode: string
          brand_id: string
          created_at?: string
          damage_label?: string | null
          damage_level?: string
          id?: string
          inbound_date?: string | null
          item_code?: string | null
          item_name: string
          metadata?: Json | null
          ro_no?: string | null
          sort_order?: number
          status?: string
          status_label?: string | null
          updated_at?: string
        }
        Update: {
          barcode?: string
          brand_id?: string
          created_at?: string
          damage_label?: string | null
          damage_level?: string
          id?: string
          inbound_date?: string | null
          item_code?: string | null
          item_name?: string
          metadata?: Json | null
          ro_no?: string | null
          sort_order?: number
          status?: string
          status_label?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      parts_workorder_loop_entries: {
        Row: {
          brand_id: string
          created_at: string
          days_pending: number
          eta_label: string | null
          id: string
          is_overdue: boolean
          metadata: Json | null
          missing_parts: string
          po_no: string | null
          ro_no: string
          sa_name: string | null
          shortage_reason: string | null
          sort_order: number
          status: string
          updated_at: string
        }
        Insert: {
          brand_id: string
          created_at?: string
          days_pending?: number
          eta_label?: string | null
          id?: string
          is_overdue?: boolean
          metadata?: Json | null
          missing_parts: string
          po_no?: string | null
          ro_no: string
          sa_name?: string | null
          shortage_reason?: string | null
          sort_order?: number
          status?: string
          updated_at?: string
        }
        Update: {
          brand_id?: string
          created_at?: string
          days_pending?: number
          eta_label?: string | null
          id?: string
          is_overdue?: boolean
          metadata?: Json | null
          missing_parts?: string
          po_no?: string | null
          ro_no?: string
          sa_name?: string | null
          shortage_reason?: string | null
          sort_order?: number
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      permissions: {
        Row: {
          category: string | null
          code: string
          created_at: string
          label: string
          module: string
        }
        Insert: {
          category?: string | null
          code: string
          created_at?: string
          label: string
          module: string
        }
        Update: {
          category?: string | null
          code?: string
          created_at?: string
          label?: string
          module?: string
        }
        Relationships: []
      }
      pos_ledger_entries: {
        Row: {
          amount: number
          brand_id: string
          category: string
          created_at: string
          created_by: string | null
          date: string
          description: string
          id: string
          metadata: Json | null
          payment_method: string | null
          ref_id: string | null
          type: string
        }
        Insert: {
          amount: number
          brand_id?: string
          category: string
          created_at?: string
          created_by?: string | null
          date?: string
          description: string
          id?: string
          metadata?: Json | null
          payment_method?: string | null
          ref_id?: string | null
          type: string
        }
        Update: {
          amount?: number
          brand_id?: string
          category?: string
          created_at?: string
          created_by?: string | null
          date?: string
          description?: string
          id?: string
          metadata?: Json | null
          payment_method?: string | null
          ref_id?: string | null
          type?: string
        }
        Relationships: []
      }
      pos_payment_orders: {
        Row: {
          amount: number
          brand_id: string
          created_at: string
          ecpay_trade_no: string | null
          expires_at: string
          form_params: Json
          item_name: string
          merchant_trade_no: string
          metadata: Json | null
          paid_at: string | null
          status: string
        }
        Insert: {
          amount: number
          brand_id?: string
          created_at?: string
          ecpay_trade_no?: string | null
          expires_at?: string
          form_params: Json
          item_name: string
          merchant_trade_no: string
          metadata?: Json | null
          paid_at?: string | null
          status?: string
        }
        Update: {
          amount?: number
          brand_id?: string
          created_at?: string
          ecpay_trade_no?: string | null
          expires_at?: string
          form_params?: Json
          item_name?: string
          merchant_trade_no?: string
          metadata?: Json | null
          paid_at?: string | null
          status?: string
        }
        Relationships: []
      }
      pos_products: {
        Row: {
          barcode: string | null
          brand_id: string
          category: string
          created_at: string
          id: string
          is_active: boolean
          low_stock_at: number
          metadata: Json | null
          name: string
          sku: string
          stock_qty: number
          unit_price: number
          updated_at: string
        }
        Insert: {
          barcode?: string | null
          brand_id?: string
          category: string
          created_at?: string
          id?: string
          is_active?: boolean
          low_stock_at?: number
          metadata?: Json | null
          name: string
          sku: string
          stock_qty?: number
          unit_price: number
          updated_at?: string
        }
        Update: {
          barcode?: string | null
          brand_id?: string
          category?: string
          created_at?: string
          id?: string
          is_active?: boolean
          low_stock_at?: number
          metadata?: Json | null
          name?: string
          sku?: string
          stock_qty?: number
          unit_price?: number
          updated_at?: string
        }
        Relationships: []
      }
      pos_shipments: {
        Row: {
          all_pay_logistics_id: string | null
          brand_id: string
          created_at: string | null
          ecpay_error: string | null
          ecpay_status: string
          goods_amount: number | null
          goods_name: string | null
          id: string
          logistics_sub_type: string
          logistics_type: string
          merchant_trade_no: string
          metadata: Json | null
          receiver_address: string | null
          receiver_name: string
          receiver_phone: string
          receiver_store_id: string | null
          receiver_zip: string | null
          transaction_id: string | null
        }
        Insert: {
          all_pay_logistics_id?: string | null
          brand_id?: string
          created_at?: string | null
          ecpay_error?: string | null
          ecpay_status?: string
          goods_amount?: number | null
          goods_name?: string | null
          id?: string
          logistics_sub_type: string
          logistics_type: string
          merchant_trade_no: string
          metadata?: Json | null
          receiver_address?: string | null
          receiver_name: string
          receiver_phone: string
          receiver_store_id?: string | null
          receiver_zip?: string | null
          transaction_id?: string | null
        }
        Update: {
          all_pay_logistics_id?: string | null
          brand_id?: string
          created_at?: string | null
          ecpay_error?: string | null
          ecpay_status?: string
          goods_amount?: number | null
          goods_name?: string | null
          id?: string
          logistics_sub_type?: string
          logistics_type?: string
          merchant_trade_no?: string
          metadata?: Json | null
          receiver_address?: string | null
          receiver_name?: string
          receiver_phone?: string
          receiver_store_id?: string | null
          receiver_zip?: string | null
          transaction_id?: string | null
        }
        Relationships: []
      }
      pos_transaction_lines: {
        Row: {
          brand_id: string
          created_at: string
          id: string
          metadata: Json | null
          product_id: string | null
          product_name: string
          product_sku: string
          qty: number
          subtotal: number
          transaction_id: string
          unit_price: number
        }
        Insert: {
          brand_id?: string
          created_at?: string
          id?: string
          metadata?: Json | null
          product_id?: string | null
          product_name: string
          product_sku: string
          qty: number
          subtotal: number
          transaction_id: string
          unit_price: number
        }
        Update: {
          brand_id?: string
          created_at?: string
          id?: string
          metadata?: Json | null
          product_id?: string | null
          product_name?: string
          product_sku?: string
          qty?: number
          subtotal?: number
          transaction_id?: string
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "pos_transaction_lines_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "pos_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_transaction_lines_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "pos_transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_transactions: {
        Row: {
          brand_id: string
          carrier_code: string | null
          cash_received: number | null
          change_amount: number | null
          created_at: string
          ecpay_invoice_date: string | null
          ecpay_invoice_no: string | null
          ecpay_random_number: string | null
          ecpay_status: string
          einvoice_id: string | null
          id: string
          invoice_type: string
          merchant_trade_no: string
          metadata: Json | null
          payment_method: string
          staff_id: string | null
          staff_name: string
          tax_id: string | null
          total_amount: number
        }
        Insert: {
          brand_id?: string
          carrier_code?: string | null
          cash_received?: number | null
          change_amount?: number | null
          created_at?: string
          ecpay_invoice_date?: string | null
          ecpay_invoice_no?: string | null
          ecpay_random_number?: string | null
          ecpay_status?: string
          einvoice_id?: string | null
          id?: string
          invoice_type?: string
          merchant_trade_no: string
          metadata?: Json | null
          payment_method: string
          staff_id?: string | null
          staff_name?: string
          tax_id?: string | null
          total_amount: number
        }
        Update: {
          brand_id?: string
          carrier_code?: string | null
          cash_received?: number | null
          change_amount?: number | null
          created_at?: string
          ecpay_invoice_date?: string | null
          ecpay_invoice_no?: string | null
          ecpay_random_number?: string | null
          ecpay_status?: string
          einvoice_id?: string | null
          id?: string
          invoice_type?: string
          merchant_trade_no?: string
          metadata?: Json | null
          payment_method?: string
          staff_id?: string | null
          staff_name?: string
          tax_id?: string | null
          total_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "pos_transactions_einvoice_id_fkey"
            columns: ["einvoice_id"]
            isOneToOne: false
            referencedRelation: "einvoices"
            referencedColumns: ["id"]
          },
        ]
      }
      pre_inspections: {
        Row: {
          appointment_id: string | null
          brand_id: string
          created_at: string
          created_by: string | null
          customer_id: string | null
          customer_name: string | null
          customer_phone: string | null
          estimated_labor_units: number | null
          estimated_subtotal: number | null
          id: string
          metadata: Json
          mileage_in: number | null
          organization_id: string | null
          pi_no: string
          repair_order_id: string | null
          sa_id: string | null
          sa_name: string | null
          signed_at: string | null
          status: string
          transferred_at: string | null
          updated_at: string
          vehicle_id: string | null
          vehicle_license_plate: string | null
          vehicle_model_name: string | null
        }
        Insert: {
          appointment_id?: string | null
          brand_id: string
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          estimated_labor_units?: number | null
          estimated_subtotal?: number | null
          id?: string
          metadata?: Json
          mileage_in?: number | null
          organization_id?: string | null
          pi_no: string
          repair_order_id?: string | null
          sa_id?: string | null
          sa_name?: string | null
          signed_at?: string | null
          status?: string
          transferred_at?: string | null
          updated_at?: string
          vehicle_id?: string | null
          vehicle_license_plate?: string | null
          vehicle_model_name?: string | null
        }
        Update: {
          appointment_id?: string | null
          brand_id?: string
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          estimated_labor_units?: number | null
          estimated_subtotal?: number | null
          id?: string
          metadata?: Json
          mileage_in?: number | null
          organization_id?: string | null
          pi_no?: string
          repair_order_id?: string | null
          sa_id?: string | null
          sa_name?: string | null
          signed_at?: string | null
          status?: string
          transferred_at?: string | null
          updated_at?: string
          vehicle_id?: string | null
          vehicle_license_plate?: string | null
          vehicle_model_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pre_inspections_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "service_appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pre_inspections_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pre_inspections_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pre_inspections_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pre_inspections_repair_order_id_fkey"
            columns: ["repair_order_id"]
            isOneToOne: false
            referencedRelation: "repair_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pre_inspections_sa_id_fkey"
            columns: ["sa_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pre_inspections_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "customer_vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_brands: {
        Row: {
          brand_id: string
          created_at: string
          role: string
          user_id: string
        }
        Insert: {
          brand_id: string
          created_at?: string
          role?: string
          user_id: string
        }
        Update: {
          brand_id?: string
          created_at?: string
          role?: string
          user_id?: string
        }
        Relationships: []
      }
      profile_subsidiaries: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          subsidiary_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          subsidiary_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          subsidiary_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_subsidiaries_subsidiary_id_fkey"
            columns: ["subsidiary_id"]
            isOneToOne: false
            referencedRelation: "subsidiaries"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          address: string | null
          avatar_path: string | null
          avatar_url: string | null
          default_brand_id: string | null
          default_landing_path: string | null
          id: string
          name: string | null
          preferred_custom_palette: Json | null
          preferred_palette_key: string | null
          preferred_sidebar_theme_key: string | null
          updated_at: string | null
        }
        Insert: {
          address?: string | null
          avatar_path?: string | null
          avatar_url?: string | null
          default_brand_id?: string | null
          default_landing_path?: string | null
          id: string
          name?: string | null
          preferred_custom_palette?: Json | null
          preferred_palette_key?: string | null
          preferred_sidebar_theme_key?: string | null
          updated_at?: string | null
        }
        Update: {
          address?: string | null
          avatar_path?: string | null
          avatar_url?: string | null
          default_brand_id?: string | null
          default_landing_path?: string | null
          id?: string
          name?: string | null
          preferred_custom_palette?: Json | null
          preferred_palette_key?: string | null
          preferred_sidebar_theme_key?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      purchase_order_lines: {
        Row: {
          batch_required: boolean
          brand_id: string
          created_at: string
          id: string
          item_id: string
          line_amount_pretax: number
          line_amount_tax: number
          line_amount_total: number
          line_no: number
          metadata: Json | null
          notes: string | null
          po_id: string
          qty_ordered: number
          qty_received: number
          qty_returned: number
          serial_required: boolean
          source_req_line_id: string | null
          tax_rate: number
          unit_price: number
          uom: string
          updated_at: string
        }
        Insert: {
          batch_required?: boolean
          brand_id?: string
          created_at?: string
          id?: string
          item_id: string
          line_amount_pretax: number
          line_amount_tax?: number
          line_amount_total: number
          line_no: number
          metadata?: Json | null
          notes?: string | null
          po_id: string
          qty_ordered: number
          qty_received?: number
          qty_returned?: number
          serial_required?: boolean
          source_req_line_id?: string | null
          tax_rate?: number
          unit_price: number
          uom?: string
          updated_at?: string
        }
        Update: {
          batch_required?: boolean
          brand_id?: string
          created_at?: string
          id?: string
          item_id?: string
          line_amount_pretax?: number
          line_amount_tax?: number
          line_amount_total?: number
          line_no?: number
          metadata?: Json | null
          notes?: string | null
          po_id?: string
          qty_ordered?: number
          qty_received?: number
          qty_returned?: number
          serial_required?: boolean
          source_req_line_id?: string | null
          tax_rate?: number
          unit_price?: number
          uom?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_order_lines_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_lines_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_lines_source_req_line_id_fkey"
            columns: ["source_req_line_id"]
            isOneToOne: false
            referencedRelation: "purchase_requisition_lines"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_orders: {
        Row: {
          amount_pretax: number
          amount_tax: number
          amount_total: number
          approved_at: string | null
          approved_by: string | null
          brand_id: string
          closed_at: string | null
          created_at: string
          created_by: string | null
          currency: string
          eta_date: string | null
          exchange_rate: number
          external_id: string | null
          external_source: string
          gl_posted: boolean
          gl_posted_at: string | null
          id: string
          metadata: Json | null
          notes: string | null
          org_id: string | null
          paid_amount: number
          po_date: string
          po_no: string
          purchase_type: string
          qty_ordered_total: number
          qty_received_total: number
          receipt_progress_pct: number
          source_req_id: string | null
          status: string
          synced_at: string | null
          updated_at: string
          vendor_id: string
          warehouse_id: string
        }
        Insert: {
          amount_pretax?: number
          amount_tax?: number
          amount_total?: number
          approved_at?: string | null
          approved_by?: string | null
          brand_id?: string
          closed_at?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          eta_date?: string | null
          exchange_rate?: number
          external_id?: string | null
          external_source?: string
          gl_posted?: boolean
          gl_posted_at?: string | null
          id?: string
          metadata?: Json | null
          notes?: string | null
          org_id?: string | null
          paid_amount?: number
          po_date?: string
          po_no: string
          purchase_type?: string
          qty_ordered_total?: number
          qty_received_total?: number
          receipt_progress_pct?: number
          source_req_id?: string | null
          status?: string
          synced_at?: string | null
          updated_at?: string
          vendor_id: string
          warehouse_id: string
        }
        Update: {
          amount_pretax?: number
          amount_tax?: number
          amount_total?: number
          approved_at?: string | null
          approved_by?: string | null
          brand_id?: string
          closed_at?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          eta_date?: string | null
          exchange_rate?: number
          external_id?: string | null
          external_source?: string
          gl_posted?: boolean
          gl_posted_at?: string | null
          id?: string
          metadata?: Json | null
          notes?: string | null
          org_id?: string | null
          paid_amount?: number
          po_date?: string
          po_no?: string
          purchase_type?: string
          qty_ordered_total?: number
          qty_received_total?: number
          receipt_progress_pct?: number
          source_req_id?: string | null
          status?: string
          synced_at?: string | null
          updated_at?: string
          vendor_id?: string
          warehouse_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_orders_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_source_req_id_fkey"
            columns: ["source_req_id"]
            isOneToOne: false
            referencedRelation: "purchase_requisitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_requisition_lines: {
        Row: {
          brand_id: string
          created_at: string
          expected_date: string | null
          id: string
          item_id: string
          line_no: number
          metadata: Json | null
          notes: string | null
          qty_converted: number
          qty_required: number
          req_id: string
          uom: string | null
          updated_at: string
        }
        Insert: {
          brand_id?: string
          created_at?: string
          expected_date?: string | null
          id?: string
          item_id: string
          line_no: number
          metadata?: Json | null
          notes?: string | null
          qty_converted?: number
          qty_required: number
          req_id: string
          uom?: string | null
          updated_at?: string
        }
        Update: {
          brand_id?: string
          created_at?: string
          expected_date?: string | null
          id?: string
          item_id?: string
          line_no?: number
          metadata?: Json | null
          notes?: string | null
          qty_converted?: number
          qty_required?: number
          req_id?: string
          uom?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_requisition_lines_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_requisition_lines_req_id_fkey"
            columns: ["req_id"]
            isOneToOne: false
            referencedRelation: "purchase_requisitions"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_requisitions: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          brand_id: string
          budget_limit: number | null
          created_at: string
          created_by: string | null
          external_id: string | null
          external_source: string
          id: string
          metadata: Json | null
          notes: string | null
          org_id: string | null
          priority: string
          req_no: string
          required_date: string | null
          source: string
          source_ref_id: string | null
          status: string
          synced_at: string | null
          updated_at: string
          warehouse_id: string | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          brand_id?: string
          budget_limit?: number | null
          created_at?: string
          created_by?: string | null
          external_id?: string | null
          external_source?: string
          id?: string
          metadata?: Json | null
          notes?: string | null
          org_id?: string | null
          priority?: string
          req_no: string
          required_date?: string | null
          source?: string
          source_ref_id?: string | null
          status?: string
          synced_at?: string | null
          updated_at?: string
          warehouse_id?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          brand_id?: string
          budget_limit?: number | null
          created_at?: string
          created_by?: string | null
          external_id?: string | null
          external_source?: string
          id?: string
          metadata?: Json | null
          notes?: string | null
          org_id?: string | null
          priority?: string
          req_no?: string
          required_date?: string | null
          source?: string
          source_ref_id?: string | null
          status?: string
          synced_at?: string | null
          updated_at?: string
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_requisitions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_requisitions_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_return_lines: {
        Row: {
          brand_id: string
          created_at: string
          id: string
          item_id: string
          line_amount: number
          line_no: number
          metadata: Json | null
          notes: string | null
          po_line_id: string | null
          qty_return: number
          rt_id: string
          unit_price: number
          uom: string | null
          updated_at: string
        }
        Insert: {
          brand_id?: string
          created_at?: string
          id?: string
          item_id: string
          line_amount: number
          line_no: number
          metadata?: Json | null
          notes?: string | null
          po_line_id?: string | null
          qty_return: number
          rt_id: string
          unit_price: number
          uom?: string | null
          updated_at?: string
        }
        Update: {
          brand_id?: string
          created_at?: string
          id?: string
          item_id?: string
          line_amount?: number
          line_no?: number
          metadata?: Json | null
          notes?: string | null
          po_line_id?: string | null
          qty_return?: number
          rt_id?: string
          unit_price?: number
          uom?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_return_lines_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_return_lines_po_line_id_fkey"
            columns: ["po_line_id"]
            isOneToOne: false
            referencedRelation: "purchase_order_lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_return_lines_rt_id_fkey"
            columns: ["rt_id"]
            isOneToOne: false
            referencedRelation: "purchase_returns"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_returns: {
        Row: {
          amount_total: number
          approved_at: string | null
          approved_by: string | null
          brand_id: string
          created_at: string
          created_by: string | null
          external_id: string | null
          external_source: string
          gl_posted: boolean
          gl_posted_at: string | null
          id: string
          logistics_provider: string | null
          logistics_tracking_no: string | null
          metadata: Json | null
          notes: string | null
          po_id: string | null
          qty_return_total: number
          refund_amount: number | null
          return_date: string
          return_reason: string
          rt_no: string
          status: string
          synced_at: string | null
          updated_at: string
          vendor_id: string
          warehouse_id: string
        }
        Insert: {
          amount_total?: number
          approved_at?: string | null
          approved_by?: string | null
          brand_id?: string
          created_at?: string
          created_by?: string | null
          external_id?: string | null
          external_source?: string
          gl_posted?: boolean
          gl_posted_at?: string | null
          id?: string
          logistics_provider?: string | null
          logistics_tracking_no?: string | null
          metadata?: Json | null
          notes?: string | null
          po_id?: string | null
          qty_return_total?: number
          refund_amount?: number | null
          return_date?: string
          return_reason?: string
          rt_no: string
          status?: string
          synced_at?: string | null
          updated_at?: string
          vendor_id: string
          warehouse_id: string
        }
        Update: {
          amount_total?: number
          approved_at?: string | null
          approved_by?: string | null
          brand_id?: string
          created_at?: string
          created_by?: string | null
          external_id?: string | null
          external_source?: string
          gl_posted?: boolean
          gl_posted_at?: string | null
          id?: string
          logistics_provider?: string | null
          logistics_tracking_no?: string | null
          metadata?: Json | null
          notes?: string | null
          po_id?: string | null
          qty_return_total?: number
          refund_amount?: number | null
          return_date?: string
          return_reason?: string
          rt_no?: string
          status?: string
          synced_at?: string | null
          updated_at?: string
          vendor_id?: string
          warehouse_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_returns_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_returns_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_returns_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      push_campaigns: {
        Row: {
          audience_count: number
          brand_id: string
          buttons: Json
          channel: string
          click_count: number
          convert_count: number
          created_at: string
          created_by: string | null
          extra_conditions: Json
          id: string
          kind: string
          message_body: string
          metadata: Json
          name: string
          read_count: number
          scheduled_at: string | null
          sent_at: string | null
          sent_count: number
          status: string
          target_habc: string[]
          template_id: string | null
          updated_at: string
        }
        Insert: {
          audience_count?: number
          brand_id?: string
          buttons?: Json
          channel: string
          click_count?: number
          convert_count?: number
          created_at?: string
          created_by?: string | null
          extra_conditions?: Json
          id?: string
          kind: string
          message_body: string
          metadata?: Json
          name: string
          read_count?: number
          scheduled_at?: string | null
          sent_at?: string | null
          sent_count?: number
          status?: string
          target_habc?: string[]
          template_id?: string | null
          updated_at?: string
        }
        Update: {
          audience_count?: number
          brand_id?: string
          buttons?: Json
          channel?: string
          click_count?: number
          convert_count?: number
          created_at?: string
          created_by?: string | null
          extra_conditions?: Json
          id?: string
          kind?: string
          message_body?: string
          metadata?: Json
          name?: string
          read_count?: number
          scheduled_at?: string | null
          sent_at?: string | null
          sent_count?: number
          status?: string
          target_habc?: string[]
          template_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_campaigns_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "push_message_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      push_message_templates: {
        Row: {
          body: string
          brand_id: string
          buttons: Json
          category: string
          channel: string
          created_at: string
          icon: string | null
          id: string
          is_active: boolean
          kind: string
          metadata: Json
          name: string
          open_rate: number | null
          updated_at: string
          used_count: number
        }
        Insert: {
          body: string
          brand_id?: string
          buttons?: Json
          category: string
          channel: string
          created_at?: string
          icon?: string | null
          id?: string
          is_active?: boolean
          kind: string
          metadata?: Json
          name: string
          open_rate?: number | null
          updated_at?: string
          used_count?: number
        }
        Update: {
          body?: string
          brand_id?: string
          buttons?: Json
          category?: string
          channel?: string
          created_at?: string
          icon?: string | null
          id?: string
          is_active?: boolean
          kind?: string
          metadata?: Json
          name?: string
          open_rate?: number | null
          updated_at?: string
          used_count?: number
        }
        Relationships: []
      }
      reminder_definitions: {
        Row: {
          accent: string
          category: string
          code: string
          created_at: string
          description: string | null
          display_order: number
          icon: string
          id: string
          is_active: boolean
          label: string
          permission: string | null
          query_kind: string
          target_href_template: string
          updated_at: string
        }
        Insert: {
          accent?: string
          category?: string
          code: string
          created_at?: string
          description?: string | null
          display_order?: number
          icon?: string
          id?: string
          is_active?: boolean
          label: string
          permission?: string | null
          query_kind: string
          target_href_template: string
          updated_at?: string
        }
        Update: {
          accent?: string
          category?: string
          code?: string
          created_at?: string
          description?: string | null
          display_order?: number
          icon?: string
          id?: string
          is_active?: boolean
          label?: string
          permission?: string | null
          query_kind?: string
          target_href_template?: string
          updated_at?: string
        }
        Relationships: []
      }
      repair_order_addons: {
        Row: {
          addon_no: number
          addon_type: string
          brand_id: string
          confirm_method: string | null
          created_at: string | null
          created_by: string | null
          customer_decision: string
          customer_decision_at: string | null
          decided_by_sa_id: string | null
          decision_note: string | null
          estimated_fee: number
          followup_case_id: string | null
          id: string
          metadata: Json | null
          name: string
          proposed_at: string
          proposed_by: string | null
          reserved_at: string | null
          reserved_movement_id: string | null
          ro_id: string
          safety_level: string
          tech_reason: string | null
          updated_at: string | null
        }
        Insert: {
          addon_no: number
          addon_type: string
          brand_id: string
          confirm_method?: string | null
          created_at?: string | null
          created_by?: string | null
          customer_decision?: string
          customer_decision_at?: string | null
          decided_by_sa_id?: string | null
          decision_note?: string | null
          estimated_fee?: number
          followup_case_id?: string | null
          id?: string
          metadata?: Json | null
          name: string
          proposed_at?: string
          proposed_by?: string | null
          reserved_at?: string | null
          reserved_movement_id?: string | null
          ro_id: string
          safety_level?: string
          tech_reason?: string | null
          updated_at?: string | null
        }
        Update: {
          addon_no?: number
          addon_type?: string
          brand_id?: string
          confirm_method?: string | null
          created_at?: string | null
          created_by?: string | null
          customer_decision?: string
          customer_decision_at?: string | null
          decided_by_sa_id?: string | null
          decision_note?: string | null
          estimated_fee?: number
          followup_case_id?: string | null
          id?: string
          metadata?: Json | null
          name?: string
          proposed_at?: string
          proposed_by?: string | null
          reserved_at?: string | null
          reserved_movement_id?: string | null
          ro_id?: string
          safety_level?: string
          tech_reason?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "repair_order_addons_ro_id_fkey"
            columns: ["ro_id"]
            isOneToOne: false
            referencedRelation: "repair_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      repair_order_lines: {
        Row: {
          amount: number
          brand_id: string
          created_at: string | null
          created_by: string | null
          id: string
          is_warranty: boolean
          item_id: string | null
          kind: string
          labor_name: string | null
          labor_note: string | null
          labor_units: number | null
          line_no: number
          metadata: Json | null
          part_code: string | null
          part_name: string | null
          qty: number | null
          repair_order_id: string
          source: string
          source_ref_id: string | null
          unit_price: number
          updated_at: string | null
        }
        Insert: {
          amount?: number
          brand_id: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_warranty?: boolean
          item_id?: string | null
          kind: string
          labor_name?: string | null
          labor_note?: string | null
          labor_units?: number | null
          line_no: number
          metadata?: Json | null
          part_code?: string | null
          part_name?: string | null
          qty?: number | null
          repair_order_id: string
          source?: string
          source_ref_id?: string | null
          unit_price?: number
          updated_at?: string | null
        }
        Update: {
          amount?: number
          brand_id?: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_warranty?: boolean
          item_id?: string | null
          kind?: string
          labor_name?: string | null
          labor_note?: string | null
          labor_units?: number | null
          line_no?: number
          metadata?: Json | null
          part_code?: string | null
          part_name?: string | null
          qty?: number | null
          repair_order_id?: string
          source?: string
          source_ref_id?: string | null
          unit_price?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "repair_order_lines_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "repair_order_lines_repair_order_id_fkey"
            columns: ["repair_order_id"]
            isOneToOne: false
            referencedRelation: "repair_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      repair_orders: {
        Row: {
          appointment_id: string | null
          brand_id: string
          closed_at: string | null
          created_at: string | null
          created_by: string | null
          customer_id: string | null
          estimated_labor_units: number | null
          estimated_subtotal: number | null
          id: string
          issue_date: string
          lead_technician_id: string | null
          lines_subtotal: number | null
          lines_total: number | null
          metadata: Json | null
          mileage_in: number | null
          opened_at: string | null
          pre_inspection_id: string | null
          prefix_p1: string
          prefix_p2: string
          ro_code: string
          sa_id: string | null
          sequence_no: number
          status: string
          store_id: string | null
          subsidiary_id: string | null
          updated_at: string | null
          vehicle_id: string | null
          warranty_status_snapshot: Json | null
        }
        Insert: {
          appointment_id?: string | null
          brand_id: string
          closed_at?: string | null
          created_at?: string | null
          created_by?: string | null
          customer_id?: string | null
          estimated_labor_units?: number | null
          estimated_subtotal?: number | null
          id?: string
          issue_date: string
          lead_technician_id?: string | null
          lines_subtotal?: number | null
          lines_total?: number | null
          metadata?: Json | null
          mileage_in?: number | null
          opened_at?: string | null
          pre_inspection_id?: string | null
          prefix_p1: string
          prefix_p2: string
          ro_code: string
          sa_id?: string | null
          sequence_no: number
          status?: string
          store_id?: string | null
          subsidiary_id?: string | null
          updated_at?: string | null
          vehicle_id?: string | null
          warranty_status_snapshot?: Json | null
        }
        Update: {
          appointment_id?: string | null
          brand_id?: string
          closed_at?: string | null
          created_at?: string | null
          created_by?: string | null
          customer_id?: string | null
          estimated_labor_units?: number | null
          estimated_subtotal?: number | null
          id?: string
          issue_date?: string
          lead_technician_id?: string | null
          lines_subtotal?: number | null
          lines_total?: number | null
          metadata?: Json | null
          mileage_in?: number | null
          opened_at?: string | null
          pre_inspection_id?: string | null
          prefix_p1?: string
          prefix_p2?: string
          ro_code?: string
          sa_id?: string | null
          sequence_no?: number
          status?: string
          store_id?: string | null
          subsidiary_id?: string | null
          updated_at?: string | null
          vehicle_id?: string | null
          warranty_status_snapshot?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "repair_orders_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "repair_orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "repair_orders_lead_technician_id_fkey"
            columns: ["lead_technician_id"]
            isOneToOne: false
            referencedRelation: "aftersales_technicians"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "repair_orders_sa_id_fkey"
            columns: ["sa_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "repair_orders_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "repair_orders_subsidiary_id_fkey"
            columns: ["subsidiary_id"]
            isOneToOne: false
            referencedRelation: "subsidiaries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "repair_orders_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "customer_vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      replenishment_policies: {
        Row: {
          auto_create_pr_for_urgent: boolean
          brand_id: string
          created_at: string
          frequency: string
          horizon_days: number
          id: string
          include_forecast: boolean
          is_active: boolean
          metadata: Json | null
          notes: string | null
          subsidiary_id: string | null
          updated_at: string
          warehouse_id: string | null
        }
        Insert: {
          auto_create_pr_for_urgent?: boolean
          brand_id: string
          created_at?: string
          frequency?: string
          horizon_days?: number
          id?: string
          include_forecast?: boolean
          is_active?: boolean
          metadata?: Json | null
          notes?: string | null
          subsidiary_id?: string | null
          updated_at?: string
          warehouse_id?: string | null
        }
        Update: {
          auto_create_pr_for_urgent?: boolean
          brand_id?: string
          created_at?: string
          frequency?: string
          horizon_days?: number
          id?: string
          include_forecast?: boolean
          is_active?: boolean
          metadata?: Json | null
          notes?: string | null
          subsidiary_id?: string | null
          updated_at?: string
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "replenishment_policies_subsidiary_id_fkey"
            columns: ["subsidiary_id"]
            isOneToOne: false
            referencedRelation: "subsidiaries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "replenishment_policies_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      replenishment_run_lines: {
        Row: {
          abc_class: string | null
          allocated_qty: number
          brand_id: string
          converted_pr_line_id: string | null
          created_at: string
          est_amount: number
          gross_demand_qty: number
          id: string
          item_id: string
          latest_order_date: string | null
          lead_time_days: number | null
          metadata: Json | null
          net_demand_qty: number
          notes: string | null
          on_hand_qty: number
          on_order_qty: number
          priority: string
          reorder_point: number
          required_date: string | null
          run_id: string
          safety_stock: number
          status: string
          suggested_qty: number
          supplier_id: string | null
          unit_price: number
          updated_at: string
          warehouse_id: string | null
        }
        Insert: {
          abc_class?: string | null
          allocated_qty?: number
          brand_id: string
          converted_pr_line_id?: string | null
          created_at?: string
          est_amount?: number
          gross_demand_qty?: number
          id?: string
          item_id: string
          latest_order_date?: string | null
          lead_time_days?: number | null
          metadata?: Json | null
          net_demand_qty?: number
          notes?: string | null
          on_hand_qty?: number
          on_order_qty?: number
          priority?: string
          reorder_point?: number
          required_date?: string | null
          run_id: string
          safety_stock?: number
          status?: string
          suggested_qty?: number
          supplier_id?: string | null
          unit_price?: number
          updated_at?: string
          warehouse_id?: string | null
        }
        Update: {
          abc_class?: string | null
          allocated_qty?: number
          brand_id?: string
          converted_pr_line_id?: string | null
          created_at?: string
          est_amount?: number
          gross_demand_qty?: number
          id?: string
          item_id?: string
          latest_order_date?: string | null
          lead_time_days?: number | null
          metadata?: Json | null
          net_demand_qty?: number
          notes?: string | null
          on_hand_qty?: number
          on_order_qty?: number
          priority?: string
          reorder_point?: number
          required_date?: string | null
          run_id?: string
          safety_stock?: number
          status?: string
          suggested_qty?: number
          supplier_id?: string | null
          unit_price?: number
          updated_at?: string
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "replenishment_run_lines_converted_pr_line_id_fkey"
            columns: ["converted_pr_line_id"]
            isOneToOne: false
            referencedRelation: "purchase_requisition_lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "replenishment_run_lines_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "replenishment_run_lines_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "replenishment_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "replenishment_run_lines_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "replenishment_run_lines_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      replenishment_runs: {
        Row: {
          brand_id: string
          created_at: string
          horizon_days: number
          id: string
          metadata: Json | null
          notes: string | null
          policy_id: string | null
          status: string
          total_amount: number
          total_lines: number
          trigger_kind: string
          triggered_by: string | null
          updated_at: string
          warehouse_id: string | null
        }
        Insert: {
          brand_id: string
          created_at?: string
          horizon_days: number
          id?: string
          metadata?: Json | null
          notes?: string | null
          policy_id?: string | null
          status?: string
          total_amount?: number
          total_lines?: number
          trigger_kind?: string
          triggered_by?: string | null
          updated_at?: string
          warehouse_id?: string | null
        }
        Update: {
          brand_id?: string
          created_at?: string
          horizon_days?: number
          id?: string
          metadata?: Json | null
          notes?: string | null
          policy_id?: string | null
          status?: string
          total_amount?: number
          total_lines?: number
          trigger_kind?: string
          triggered_by?: string | null
          updated_at?: string
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "replenishment_runs_policy_id_fkey"
            columns: ["policy_id"]
            isOneToOne: false
            referencedRelation: "replenishment_policies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "replenishment_runs_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      ro_checkouts: {
        Row: {
          brand_id: string
          checkout_no: string
          closed_at: string | null
          created_at: string | null
          created_by: string | null
          customer_signature: Json | null
          fee_summary: Json | null
          fees_confirmed_at: string | null
          id: string
          invoice: Json | null
          metadata: Json | null
          payment: Json | null
          receipt_printed_at: string | null
          repair_order_id: string
          status: string
          updated_at: string | null
        }
        Insert: {
          brand_id: string
          checkout_no: string
          closed_at?: string | null
          created_at?: string | null
          created_by?: string | null
          customer_signature?: Json | null
          fee_summary?: Json | null
          fees_confirmed_at?: string | null
          id?: string
          invoice?: Json | null
          metadata?: Json | null
          payment?: Json | null
          receipt_printed_at?: string | null
          repair_order_id: string
          status?: string
          updated_at?: string | null
        }
        Update: {
          brand_id?: string
          checkout_no?: string
          closed_at?: string | null
          created_at?: string | null
          created_by?: string | null
          customer_signature?: Json | null
          fee_summary?: Json | null
          fees_confirmed_at?: string | null
          id?: string
          invoice?: Json | null
          metadata?: Json | null
          payment?: Json | null
          receipt_printed_at?: string | null
          repair_order_id?: string
          status?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ro_checkouts_repair_order_id_fkey"
            columns: ["repair_order_id"]
            isOneToOne: true
            referencedRelation: "repair_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      role_permissions: {
        Row: {
          permission_code: string
          role_id: string
        }
        Insert: {
          permission_code: string
          role_id: string
        }
        Update: {
          permission_code?: string
          role_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_permission_code_fkey"
            columns: ["permission_code"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "role_permissions_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      roles: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_system: boolean
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id: string
          is_system?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_system?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      sales_dictionary: {
        Row: {
          brand_id: string
          code: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          is_system: boolean
          kind: string
          label: string
          metadata: Json
          sort_order: number
          updated_at: string
        }
        Insert: {
          brand_id: string
          code: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_system?: boolean
          kind: string
          label: string
          metadata?: Json
          sort_order?: number
          updated_at?: string
        }
        Update: {
          brand_id?: string
          code?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_system?: boolean
          kind?: string
          label?: string
          metadata?: Json
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_dictionary_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_handcards: {
        Row: {
          assigned_rs_name: string | null
          assigned_rs_user_id: string | null
          brand_id: string
          competitor_brand: string | null
          competitor_model: string | null
          created_at: string
          created_by: string | null
          customer_email: string | null
          customer_id: string | null
          customer_identity: string | null
          customer_name: string
          customer_phone: string | null
          id: string
          intended_models: string[] | null
          intent_level: number | null
          lead_grade: string | null
          lead_id: string | null
          metadata: Json
          notes: string | null
          organization_id: string | null
          purchase_timing: string | null
          quote_remark: string | null
          quoted_amount: number | null
          reception_date: string
          reception_period: string | null
          status: string
          trial_status: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          assigned_rs_name?: string | null
          assigned_rs_user_id?: string | null
          brand_id: string
          competitor_brand?: string | null
          competitor_model?: string | null
          created_at?: string
          created_by?: string | null
          customer_email?: string | null
          customer_id?: string | null
          customer_identity?: string | null
          customer_name: string
          customer_phone?: string | null
          id?: string
          intended_models?: string[] | null
          intent_level?: number | null
          lead_grade?: string | null
          lead_id?: string | null
          metadata?: Json
          notes?: string | null
          organization_id?: string | null
          purchase_timing?: string | null
          quote_remark?: string | null
          quoted_amount?: number | null
          reception_date?: string
          reception_period?: string | null
          status?: string
          trial_status?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          assigned_rs_name?: string | null
          assigned_rs_user_id?: string | null
          brand_id?: string
          competitor_brand?: string | null
          competitor_model?: string | null
          created_at?: string
          created_by?: string | null
          customer_email?: string | null
          customer_id?: string | null
          customer_identity?: string | null
          customer_name?: string
          customer_phone?: string | null
          id?: string
          intended_models?: string[] | null
          intent_level?: number | null
          lead_grade?: string | null
          lead_id?: string | null
          metadata?: Json
          notes?: string | null
          organization_id?: string | null
          purchase_timing?: string | null
          quote_remark?: string | null
          quoted_amount?: number | null
          reception_date?: string
          reception_period?: string | null
          status?: string
          trial_status?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_handcards_assigned_rs_user_id_fkey"
            columns: ["assigned_rs_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_handcards_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_handcards_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "sales_leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_handcards_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_leads: {
        Row: {
          assignee_id: string | null
          brand_id: string
          code: string
          competitor_brand: string | null
          converted_customer_id: string | null
          created_at: string
          created_by: string | null
          dormancy_status: string
          email: string | null
          follow_date: string | null
          habc: string
          id: string
          intent_model: string | null
          is_active: boolean
          kind: string
          last_revive_at: string | null
          last_visit_at: string | null
          lost_at: string | null
          lost_reason: string | null
          metadata: Json | null
          name: string
          next_revive_at: string | null
          note: string | null
          phone: string | null
          revive_attempt_count: number
          rs_name: string | null
          source: string | null
          updated_at: string
        }
        Insert: {
          assignee_id?: string | null
          brand_id: string
          code: string
          competitor_brand?: string | null
          converted_customer_id?: string | null
          created_at?: string
          created_by?: string | null
          dormancy_status?: string
          email?: string | null
          follow_date?: string | null
          habc: string
          id?: string
          intent_model?: string | null
          is_active?: boolean
          kind?: string
          last_revive_at?: string | null
          last_visit_at?: string | null
          lost_at?: string | null
          lost_reason?: string | null
          metadata?: Json | null
          name: string
          next_revive_at?: string | null
          note?: string | null
          phone?: string | null
          revive_attempt_count?: number
          rs_name?: string | null
          source?: string | null
          updated_at?: string
        }
        Update: {
          assignee_id?: string | null
          brand_id?: string
          code?: string
          competitor_brand?: string | null
          converted_customer_id?: string | null
          created_at?: string
          created_by?: string | null
          dormancy_status?: string
          email?: string | null
          follow_date?: string | null
          habc?: string
          id?: string
          intent_model?: string | null
          is_active?: boolean
          kind?: string
          last_revive_at?: string | null
          last_visit_at?: string | null
          lost_at?: string | null
          lost_reason?: string | null
          metadata?: Json | null
          name?: string
          next_revive_at?: string | null
          note?: string | null
          phone?: string | null
          revive_attempt_count?: number
          rs_name?: string | null
          source?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_leads_converted_customer_id_fkey"
            columns: ["converted_customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_orders: {
        Row: {
          brand_id: string
          buyer_national_id: string | null
          condition_notes: string | null
          contract_type: string
          created_at: string
          created_by: string | null
          customer_address: string | null
          customer_email: string | null
          customer_id: string | null
          customer_name: string | null
          customer_phone: string | null
          deal_price: number | null
          delivery_date: string | null
          down_payment: number | null
          final_payment_date: string | null
          fulfilled_at: string | null
          id: string
          lead_id: string | null
          metadata: Json
          order_no: string
          payment_method: string | null
          quote_snapshot: Json | null
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          rs_name: string | null
          signature_buyer: string | null
          signature_seller: string | null
          signature_witness: string | null
          signed_at: string | null
          special_notes: string | null
          status: string
          submitted_at: string | null
          total_amount: number | null
          transfer_by: string | null
          updated_at: string
          updated_by: string | null
          used_brand_model: string | null
          used_cc: string | null
          used_cert_level: string | null
          used_mileage: string | null
          used_plate: string | null
          used_vehicle_id: string | null
          used_year: string | null
          vehicle_color: string | null
          vehicle_engine_no: string | null
          vehicle_model_id: string | null
          vehicle_model_name: string | null
          vehicle_vin: string | null
        }
        Insert: {
          brand_id: string
          buyer_national_id?: string | null
          condition_notes?: string | null
          contract_type: string
          created_at?: string
          created_by?: string | null
          customer_address?: string | null
          customer_email?: string | null
          customer_id?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          deal_price?: number | null
          delivery_date?: string | null
          down_payment?: number | null
          final_payment_date?: string | null
          fulfilled_at?: string | null
          id?: string
          lead_id?: string | null
          metadata?: Json
          order_no: string
          payment_method?: string | null
          quote_snapshot?: Json | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          rs_name?: string | null
          signature_buyer?: string | null
          signature_seller?: string | null
          signature_witness?: string | null
          signed_at?: string | null
          special_notes?: string | null
          status?: string
          submitted_at?: string | null
          total_amount?: number | null
          transfer_by?: string | null
          updated_at?: string
          updated_by?: string | null
          used_brand_model?: string | null
          used_cc?: string | null
          used_cert_level?: string | null
          used_mileage?: string | null
          used_plate?: string | null
          used_vehicle_id?: string | null
          used_year?: string | null
          vehicle_color?: string | null
          vehicle_engine_no?: string | null
          vehicle_model_id?: string | null
          vehicle_model_name?: string | null
          vehicle_vin?: string | null
        }
        Update: {
          brand_id?: string
          buyer_national_id?: string | null
          condition_notes?: string | null
          contract_type?: string
          created_at?: string
          created_by?: string | null
          customer_address?: string | null
          customer_email?: string | null
          customer_id?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          deal_price?: number | null
          delivery_date?: string | null
          down_payment?: number | null
          final_payment_date?: string | null
          fulfilled_at?: string | null
          id?: string
          lead_id?: string | null
          metadata?: Json
          order_no?: string
          payment_method?: string | null
          quote_snapshot?: Json | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          rs_name?: string | null
          signature_buyer?: string | null
          signature_seller?: string | null
          signature_witness?: string | null
          signed_at?: string | null
          special_notes?: string | null
          status?: string
          submitted_at?: string | null
          total_amount?: number | null
          transfer_by?: string | null
          updated_at?: string
          updated_by?: string | null
          used_brand_model?: string | null
          used_cc?: string | null
          used_cert_level?: string | null
          used_mileage?: string | null
          used_plate?: string | null
          used_vehicle_id?: string | null
          used_year?: string | null
          vehicle_color?: string | null
          vehicle_engine_no?: string | null
          vehicle_model_id?: string | null
          vehicle_model_name?: string | null
          vehicle_vin?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_orders_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "sales_leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_orders_used_vehicle_id_fkey"
            columns: ["used_vehicle_id"]
            isOneToOne: false
            referencedRelation: "used_car_inventory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_orders_vehicle_model_id_fkey"
            columns: ["vehicle_model_id"]
            isOneToOne: false
            referencedRelation: "vehicle_models"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_test_drives: {
        Row: {
          brand_id: string
          completed_at: string | null
          created_at: string
          created_by: string | null
          customer_id: string | null
          id: string
          lead_id: string | null
          metadata: Json
          notes: string | null
          sales_consultant_id: string | null
          scheduled_at: string
          status: string
          updated_at: string
          vehicle_model_id: string | null
        }
        Insert: {
          brand_id: string
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          id?: string
          lead_id?: string | null
          metadata?: Json
          notes?: string | null
          sales_consultant_id?: string | null
          scheduled_at: string
          status?: string
          updated_at?: string
          vehicle_model_id?: string | null
        }
        Update: {
          brand_id?: string
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          id?: string
          lead_id?: string | null
          metadata?: Json
          notes?: string | null
          sales_consultant_id?: string | null
          scheduled_at?: string
          status?: string
          updated_at?: string
          vehicle_model_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_test_drives_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_test_drives_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "sales_leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_test_drives_sales_consultant_id_fkey"
            columns: ["sales_consultant_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_test_drives_vehicle_model_id_fkey"
            columns: ["vehicle_model_id"]
            isOneToOne: false
            referencedRelation: "vehicle_models"
            referencedColumns: ["id"]
          },
        ]
      }
      service_appointments: {
        Row: {
          advisor_id: string | null
          appt_no: string
          brand_id: string
          created_at: string
          created_by: string | null
          customer_id: string
          duration_minutes: number
          external_id: string | null
          external_source: string
          id: string
          metadata: Json | null
          mileage_at_appointment: number | null
          notes: string | null
          scheduled_at: string
          service_type: string
          status: string
          synced_at: string | null
          updated_at: string
          vehicle_id: string | null
          work_order_id: string | null
        }
        Insert: {
          advisor_id?: string | null
          appt_no: string
          brand_id: string
          created_at?: string
          created_by?: string | null
          customer_id: string
          duration_minutes?: number
          external_id?: string | null
          external_source?: string
          id?: string
          metadata?: Json | null
          mileage_at_appointment?: number | null
          notes?: string | null
          scheduled_at: string
          service_type?: string
          status?: string
          synced_at?: string | null
          updated_at?: string
          vehicle_id?: string | null
          work_order_id?: string | null
        }
        Update: {
          advisor_id?: string | null
          appt_no?: string
          brand_id?: string
          created_at?: string
          created_by?: string | null
          customer_id?: string
          duration_minutes?: number
          external_id?: string | null
          external_source?: string
          id?: string
          metadata?: Json | null
          mileage_at_appointment?: number | null
          notes?: string | null
          scheduled_at?: string
          service_type?: string
          status?: string
          synced_at?: string | null
          updated_at?: string
          vehicle_id?: string | null
          work_order_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "service_appointments_advisor_id_fkey"
            columns: ["advisor_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_appointments_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_appointments_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "customer_vehicles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_appointments_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      service_bays: {
        Row: {
          bay_type: string | null
          brand_id: string
          code: string
          created_at: string
          current_item: string | null
          current_ro_code: string | null
          current_tech_color: string | null
          current_tech_name: string | null
          done_today: number
          id: string
          is_active: boolean
          metadata: Json
          name: string
          organization_id: string | null
          purpose: string | null
          sort_order: number
          started_at: string | null
          status: string
          subsidiary_id: string | null
          updated_at: string
          used_minutes: number
        }
        Insert: {
          bay_type?: string | null
          brand_id: string
          code: string
          created_at?: string
          current_item?: string | null
          current_ro_code?: string | null
          current_tech_color?: string | null
          current_tech_name?: string | null
          done_today?: number
          id?: string
          is_active?: boolean
          metadata?: Json
          name: string
          organization_id?: string | null
          purpose?: string | null
          sort_order?: number
          started_at?: string | null
          status?: string
          subsidiary_id?: string | null
          updated_at?: string
          used_minutes?: number
        }
        Update: {
          bay_type?: string | null
          brand_id?: string
          code?: string
          created_at?: string
          current_item?: string | null
          current_ro_code?: string | null
          current_tech_color?: string | null
          current_tech_name?: string | null
          done_today?: number
          id?: string
          is_active?: boolean
          metadata?: Json
          name?: string
          organization_id?: string | null
          purpose?: string | null
          sort_order?: number
          started_at?: string | null
          status?: string
          subsidiary_id?: string | null
          updated_at?: string
          used_minutes?: number
        }
        Relationships: [
          {
            foreignKeyName: "service_bays_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_bays_subsidiary_id_fkey"
            columns: ["subsidiary_id"]
            isOneToOne: false
            referencedRelation: "subsidiaries"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_issue_lines: {
        Row: {
          batch_no: string | null
          bin_id: string | null
          brand_id: string
          created_at: string
          gi_id: string
          id: string
          item_id: string
          line_amount: number | null
          line_no: number
          metadata: Json | null
          notes: string | null
          qty_issued: number
          serial_no: string | null
          unit_cost: number | null
          unit_price: number | null
          uom: string
          updated_at: string
        }
        Insert: {
          batch_no?: string | null
          bin_id?: string | null
          brand_id?: string
          created_at?: string
          gi_id: string
          id?: string
          item_id: string
          line_amount?: number | null
          line_no: number
          metadata?: Json | null
          notes?: string | null
          qty_issued: number
          serial_no?: string | null
          unit_cost?: number | null
          unit_price?: number | null
          uom?: string
          updated_at?: string
        }
        Update: {
          batch_no?: string | null
          bin_id?: string | null
          brand_id?: string
          created_at?: string
          gi_id?: string
          id?: string
          item_id?: string
          line_amount?: number | null
          line_no?: number
          metadata?: Json | null
          notes?: string | null
          qty_issued?: number
          serial_no?: string | null
          unit_cost?: number | null
          unit_price?: number | null
          uom?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_issue_lines_bin_id_fkey"
            columns: ["bin_id"]
            isOneToOne: false
            referencedRelation: "warehouse_bins"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_issue_lines_gi_id_fkey"
            columns: ["gi_id"]
            isOneToOne: false
            referencedRelation: "stock_issues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_issue_lines_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_issues: {
        Row: {
          amount_total: number
          brand_id: string
          created_at: string
          created_by: string | null
          customer_id: string | null
          external_id: string | null
          external_source: string
          gi_no: string
          gl_posted: boolean
          gl_posted_at: string | null
          id: string
          issue_date: string
          metadata: Json | null
          notes: string | null
          posted_at: string | null
          posted_by: string | null
          qty_issued_total: number
          ro_id: string | null
          source_doc_id: string | null
          source_doc_type: string | null
          status: string
          synced_at: string | null
          type: string
          updated_at: string
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
          warehouse_id: string
        }
        Insert: {
          amount_total?: number
          brand_id?: string
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          external_id?: string | null
          external_source?: string
          gi_no: string
          gl_posted?: boolean
          gl_posted_at?: string | null
          id?: string
          issue_date?: string
          metadata?: Json | null
          notes?: string | null
          posted_at?: string | null
          posted_by?: string | null
          qty_issued_total?: number
          ro_id?: string | null
          source_doc_id?: string | null
          source_doc_type?: string | null
          status?: string
          synced_at?: string | null
          type: string
          updated_at?: string
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
          warehouse_id: string
        }
        Update: {
          amount_total?: number
          brand_id?: string
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          external_id?: string | null
          external_source?: string
          gi_no?: string
          gl_posted?: boolean
          gl_posted_at?: string | null
          id?: string
          issue_date?: string
          metadata?: Json | null
          notes?: string | null
          posted_at?: string | null
          posted_by?: string | null
          qty_issued_total?: number
          ro_id?: string | null
          source_doc_id?: string | null
          source_doc_type?: string | null
          status?: string
          synced_at?: string | null
          type?: string
          updated_at?: string
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
          warehouse_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_issues_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_issues_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_items: {
        Row: {
          batch_no: string | null
          bin_id: string | null
          brand_id: string
          consignment_id: string | null
          created_at: string
          external_id: string | null
          external_source: string
          id: string
          item_id: string
          last_movement_at: string
          metadata: Json | null
          notes: string | null
          qty: number
          reserved_for_doc_id: string | null
          reserved_for_doc_type: string | null
          serial_no: string | null
          source_receipt_line_id: string | null
          source_transfer_line_id: string | null
          status: string
          synced_at: string | null
          unit_cost: number
          updated_at: string
          warehouse_id: string
          warranty_end: string | null
          warranty_start: string | null
        }
        Insert: {
          batch_no?: string | null
          bin_id?: string | null
          brand_id?: string
          consignment_id?: string | null
          created_at?: string
          external_id?: string | null
          external_source?: string
          id?: string
          item_id: string
          last_movement_at?: string
          metadata?: Json | null
          notes?: string | null
          qty?: number
          reserved_for_doc_id?: string | null
          reserved_for_doc_type?: string | null
          serial_no?: string | null
          source_receipt_line_id?: string | null
          source_transfer_line_id?: string | null
          status?: string
          synced_at?: string | null
          unit_cost?: number
          updated_at?: string
          warehouse_id: string
          warranty_end?: string | null
          warranty_start?: string | null
        }
        Update: {
          batch_no?: string | null
          bin_id?: string | null
          brand_id?: string
          consignment_id?: string | null
          created_at?: string
          external_id?: string | null
          external_source?: string
          id?: string
          item_id?: string
          last_movement_at?: string
          metadata?: Json | null
          notes?: string | null
          qty?: number
          reserved_for_doc_id?: string | null
          reserved_for_doc_type?: string | null
          serial_no?: string | null
          source_receipt_line_id?: string | null
          source_transfer_line_id?: string | null
          status?: string
          synced_at?: string | null
          unit_cost?: number
          updated_at?: string
          warehouse_id?: string
          warranty_end?: string | null
          warranty_start?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_items_bin_id_fkey"
            columns: ["bin_id"]
            isOneToOne: false
            referencedRelation: "warehouse_bins"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_items_consignment_id_fkey"
            columns: ["consignment_id"]
            isOneToOne: false
            referencedRelation: "consignment_stocks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_items_source_receipt_line_id_fkey"
            columns: ["source_receipt_line_id"]
            isOneToOne: false
            referencedRelation: "stock_receipt_lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_items_source_transfer_line_id_fkey"
            columns: ["source_transfer_line_id"]
            isOneToOne: false
            referencedRelation: "stock_transfer_lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_items_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_movements: {
        Row: {
          brand_id: string
          created_at: string
          created_by: string | null
          direction: string
          id: string
          item_id: string
          metadata: Json | null
          qty: number
          reason: string
          source_id: string | null
          source_table: string
          warehouse_id: string
        }
        Insert: {
          brand_id: string
          created_at?: string
          created_by?: string | null
          direction: string
          id?: string
          item_id: string
          metadata?: Json | null
          qty: number
          reason: string
          source_id?: string | null
          source_table: string
          warehouse_id: string
        }
        Update: {
          brand_id?: string
          created_at?: string
          created_by?: string | null
          direction?: string
          id?: string
          item_id?: string
          metadata?: Json | null
          qty?: number
          reason?: string
          source_id?: string | null
          source_table?: string
          warehouse_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_movements_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_receipt_lines: {
        Row: {
          batch_required: boolean
          bin_id: string | null
          brand_id: string
          created_at: string
          gr_id: string
          id: string
          item_id: string
          line_amount: number
          line_no: number
          metadata: Json | null
          notes: string | null
          qty_received: number
          serial_required: boolean
          source_line_id: string | null
          source_line_type: string | null
          unit_cost: number
          uom: string
          updated_at: string
          warranty_end: string | null
          warranty_start: string | null
        }
        Insert: {
          batch_required?: boolean
          bin_id?: string | null
          brand_id?: string
          created_at?: string
          gr_id: string
          id?: string
          item_id: string
          line_amount: number
          line_no: number
          metadata?: Json | null
          notes?: string | null
          qty_received: number
          serial_required?: boolean
          source_line_id?: string | null
          source_line_type?: string | null
          unit_cost: number
          uom?: string
          updated_at?: string
          warranty_end?: string | null
          warranty_start?: string | null
        }
        Update: {
          batch_required?: boolean
          bin_id?: string | null
          brand_id?: string
          created_at?: string
          gr_id?: string
          id?: string
          item_id?: string
          line_amount?: number
          line_no?: number
          metadata?: Json | null
          notes?: string | null
          qty_received?: number
          serial_required?: boolean
          source_line_id?: string | null
          source_line_type?: string | null
          unit_cost?: number
          uom?: string
          updated_at?: string
          warranty_end?: string | null
          warranty_start?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_receipt_lines_bin_id_fkey"
            columns: ["bin_id"]
            isOneToOne: false
            referencedRelation: "warehouse_bins"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_receipt_lines_gr_id_fkey"
            columns: ["gr_id"]
            isOneToOne: false
            referencedRelation: "stock_receipts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_receipt_lines_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_receipts: {
        Row: {
          amount_total: number
          brand_id: string
          created_at: string
          created_by: string | null
          customer_id: string | null
          external_id: string | null
          external_source: string
          gl_posted: boolean
          gl_posted_at: string | null
          gr_no: string
          id: string
          metadata: Json | null
          notes: string | null
          posted_at: string | null
          posted_by: string | null
          qty_received_total: number
          receipt_date: string
          source_doc_id: string | null
          source_doc_type: string | null
          status: string
          synced_at: string | null
          type: string
          updated_at: string
          vendor_id: string | null
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
          warehouse_id: string
        }
        Insert: {
          amount_total?: number
          brand_id?: string
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          external_id?: string | null
          external_source?: string
          gl_posted?: boolean
          gl_posted_at?: string | null
          gr_no: string
          id?: string
          metadata?: Json | null
          notes?: string | null
          posted_at?: string | null
          posted_by?: string | null
          qty_received_total?: number
          receipt_date?: string
          source_doc_id?: string | null
          source_doc_type?: string | null
          status?: string
          synced_at?: string | null
          type: string
          updated_at?: string
          vendor_id?: string | null
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
          warehouse_id: string
        }
        Update: {
          amount_total?: number
          brand_id?: string
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          external_id?: string | null
          external_source?: string
          gl_posted?: boolean
          gl_posted_at?: string | null
          gr_no?: string
          id?: string
          metadata?: Json | null
          notes?: string | null
          posted_at?: string | null
          posted_by?: string | null
          qty_received_total?: number
          receipt_date?: string
          source_doc_id?: string | null
          source_doc_type?: string | null
          status?: string
          synced_at?: string | null
          type?: string
          updated_at?: string
          vendor_id?: string | null
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
          warehouse_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_receipts_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_receipts_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_receipts_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_thresholds: {
        Row: {
          abc_class: string | null
          alert_priority: string
          brand_id: string
          created_at: string
          id: string
          is_active: boolean
          item_id: string
          max_stock: number | null
          metadata: Json | null
          min_stock: number
          reorder_point: number
          safety_stock: number
          updated_at: string
          warehouse_id: string
        }
        Insert: {
          abc_class?: string | null
          alert_priority?: string
          brand_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          item_id: string
          max_stock?: number | null
          metadata?: Json | null
          min_stock?: number
          reorder_point?: number
          safety_stock?: number
          updated_at?: string
          warehouse_id: string
        }
        Update: {
          abc_class?: string | null
          alert_priority?: string
          brand_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          item_id?: string
          max_stock?: number | null
          metadata?: Json | null
          min_stock?: number
          reorder_point?: number
          safety_stock?: number
          updated_at?: string
          warehouse_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_thresholds_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_thresholds_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_transfer_lines: {
        Row: {
          brand_id: string
          created_at: string
          id: string
          item_id: string
          line_no: number
          metadata: Json | null
          notes: string | null
          qty_received: number
          qty_requested: number
          qty_shipped: number
          source_bin_id: string | null
          target_bin_id: string | null
          tr_id: string
          unit_cost: number | null
          uom: string
          updated_at: string
        }
        Insert: {
          brand_id?: string
          created_at?: string
          id?: string
          item_id: string
          line_no: number
          metadata?: Json | null
          notes?: string | null
          qty_received?: number
          qty_requested: number
          qty_shipped?: number
          source_bin_id?: string | null
          target_bin_id?: string | null
          tr_id: string
          unit_cost?: number | null
          uom?: string
          updated_at?: string
        }
        Update: {
          brand_id?: string
          created_at?: string
          id?: string
          item_id?: string
          line_no?: number
          metadata?: Json | null
          notes?: string | null
          qty_received?: number
          qty_requested?: number
          qty_shipped?: number
          source_bin_id?: string | null
          target_bin_id?: string | null
          tr_id?: string
          unit_cost?: number | null
          uom?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_transfer_lines_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_transfer_lines_source_bin_id_fkey"
            columns: ["source_bin_id"]
            isOneToOne: false
            referencedRelation: "warehouse_bins"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_transfer_lines_target_bin_id_fkey"
            columns: ["target_bin_id"]
            isOneToOne: false
            referencedRelation: "warehouse_bins"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_transfer_lines_tr_id_fkey"
            columns: ["tr_id"]
            isOneToOne: false
            referencedRelation: "stock_transfers"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_transfers: {
        Row: {
          actual_arrival_date: string | null
          brand_id: string
          created_at: string
          created_by: string | null
          expected_arrival_date: string | null
          external_id: string | null
          external_source: string
          id: string
          logistics_provider: string | null
          logistics_tracking_no: string | null
          metadata: Json | null
          notes: string | null
          qty_received_total: number
          qty_requested_total: number
          qty_shipped_total: number
          reason: string | null
          received_at: string | null
          received_by: string | null
          ship_date: string | null
          shipped_at: string | null
          shipped_by: string | null
          source_warehouse_id: string
          status: string
          synced_at: string | null
          target_warehouse_id: string
          tr_no: string
          transfer_type: string
          updated_at: string
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
        }
        Insert: {
          actual_arrival_date?: string | null
          brand_id?: string
          created_at?: string
          created_by?: string | null
          expected_arrival_date?: string | null
          external_id?: string | null
          external_source?: string
          id?: string
          logistics_provider?: string | null
          logistics_tracking_no?: string | null
          metadata?: Json | null
          notes?: string | null
          qty_received_total?: number
          qty_requested_total?: number
          qty_shipped_total?: number
          reason?: string | null
          received_at?: string | null
          received_by?: string | null
          ship_date?: string | null
          shipped_at?: string | null
          shipped_by?: string | null
          source_warehouse_id: string
          status?: string
          synced_at?: string | null
          target_warehouse_id: string
          tr_no: string
          transfer_type?: string
          updated_at?: string
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Update: {
          actual_arrival_date?: string | null
          brand_id?: string
          created_at?: string
          created_by?: string | null
          expected_arrival_date?: string | null
          external_id?: string | null
          external_source?: string
          id?: string
          logistics_provider?: string | null
          logistics_tracking_no?: string | null
          metadata?: Json | null
          notes?: string | null
          qty_received_total?: number
          qty_requested_total?: number
          qty_shipped_total?: number
          reason?: string | null
          received_at?: string | null
          received_by?: string | null
          ship_date?: string | null
          shipped_at?: string | null
          shipped_by?: string | null
          source_warehouse_id?: string
          status?: string
          synced_at?: string | null
          target_warehouse_id?: string
          tr_no?: string
          transfer_type?: string
          updated_at?: string
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_transfers_source_warehouse_id_fkey"
            columns: ["source_warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_transfers_target_warehouse_id_fkey"
            columns: ["target_warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      store_brands: {
        Row: {
          brand_id: string
          store_id: string
        }
        Insert: {
          brand_id: string
          store_id: string
        }
        Update: {
          brand_id?: string
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "store_brands_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_brands_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      subsidiaries: {
        Row: {
          address: string | null
          base_currency: string
          created_at: string
          created_by: string | null
          external_source: string | null
          group_id: string
          id: string
          is_active: boolean
          is_root: boolean
          legal_name: string
          metadata: Json | null
          netsuite_external_id: string | null
          netsuite_subsidiary_id: string | null
          notes: string | null
          parent_subsidiary_id: string | null
          phone: string | null
          responsible_person: string | null
          short_name: string | null
          synced_at: string | null
          tax_id: string
          tax_id_country: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          base_currency?: string
          created_at?: string
          created_by?: string | null
          external_source?: string | null
          group_id: string
          id?: string
          is_active?: boolean
          is_root?: boolean
          legal_name: string
          metadata?: Json | null
          netsuite_external_id?: string | null
          netsuite_subsidiary_id?: string | null
          notes?: string | null
          parent_subsidiary_id?: string | null
          phone?: string | null
          responsible_person?: string | null
          short_name?: string | null
          synced_at?: string | null
          tax_id: string
          tax_id_country?: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          base_currency?: string
          created_at?: string
          created_by?: string | null
          external_source?: string | null
          group_id?: string
          id?: string
          is_active?: boolean
          is_root?: boolean
          legal_name?: string
          metadata?: Json | null
          netsuite_external_id?: string | null
          netsuite_subsidiary_id?: string | null
          notes?: string | null
          parent_subsidiary_id?: string | null
          phone?: string | null
          responsible_person?: string | null
          short_name?: string | null
          synced_at?: string | null
          tax_id?: string
          tax_id_country?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subsidiaries_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subsidiaries_parent_subsidiary_id_fkey"
            columns: ["parent_subsidiary_id"]
            isOneToOne: false
            referencedRelation: "subsidiaries"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_contracts: {
        Row: {
          brand_id: string
          contract_no: string
          created_at: string
          document_url: string | null
          effective_from: string
          effective_to: string | null
          id: string
          metadata: Json | null
          min_order_amount: number | null
          notes: string | null
          payment_terms: string | null
          status: string
          supplier_id: string
          updated_at: string
        }
        Insert: {
          brand_id?: string
          contract_no: string
          created_at?: string
          document_url?: string | null
          effective_from: string
          effective_to?: string | null
          id?: string
          metadata?: Json | null
          min_order_amount?: number | null
          notes?: string | null
          payment_terms?: string | null
          status?: string
          supplier_id: string
          updated_at?: string
        }
        Update: {
          brand_id?: string
          contract_no?: string
          created_at?: string
          document_url?: string | null
          effective_from?: string
          effective_to?: string | null
          id?: string
          metadata?: Json | null
          min_order_amount?: number | null
          notes?: string | null
          payment_terms?: string | null
          status?: string
          supplier_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_contracts_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_item_pricing: {
        Row: {
          brand_id: string
          created_at: string
          currency: string
          id: string
          is_active: boolean
          is_primary: boolean
          item_id: string
          lead_time_days: number
          metadata: Json | null
          min_order_qty: number
          notes: string | null
          order_multiple: number
          supplier_id: string
          unit_price: number
          updated_at: string
          valid_from: string | null
          valid_to: string | null
        }
        Insert: {
          brand_id: string
          created_at?: string
          currency?: string
          id?: string
          is_active?: boolean
          is_primary?: boolean
          item_id: string
          lead_time_days?: number
          metadata?: Json | null
          min_order_qty?: number
          notes?: string | null
          order_multiple?: number
          supplier_id: string
          unit_price?: number
          updated_at?: string
          valid_from?: string | null
          valid_to?: string | null
        }
        Update: {
          brand_id?: string
          created_at?: string
          currency?: string
          id?: string
          is_active?: boolean
          is_primary?: boolean
          item_id?: string
          lead_time_days?: number
          metadata?: Json | null
          min_order_qty?: number
          notes?: string | null
          order_multiple?: number
          supplier_id?: string
          unit_price?: number
          updated_at?: string
          valid_from?: string | null
          valid_to?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "supplier_item_pricing_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_item_pricing_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          address: string | null
          brand_id: string
          code: string
          created_at: string
          created_by: string | null
          default_currency: string
          default_expense_coa_id: string | null
          default_tax_code_id: string | null
          email: string | null
          external_id: string | null
          external_source: string
          gl_payable_coa_id: string | null
          id: string
          is_active: boolean
          is_withholding_required: boolean | null
          metadata: Json | null
          name: string
          notes: string | null
          payment_terms: string | null
          payment_terms_days: number | null
          phone: string | null
          primary_contact: string | null
          subsidiary_id: string | null
          supplier_type: string | null
          synced_at: string | null
          tax_id: string | null
          type: string
          updated_at: string
          withholding_tax_code_id: string | null
        }
        Insert: {
          address?: string | null
          brand_id?: string
          code: string
          created_at?: string
          created_by?: string | null
          default_currency?: string
          default_expense_coa_id?: string | null
          default_tax_code_id?: string | null
          email?: string | null
          external_id?: string | null
          external_source?: string
          gl_payable_coa_id?: string | null
          id?: string
          is_active?: boolean
          is_withholding_required?: boolean | null
          metadata?: Json | null
          name: string
          notes?: string | null
          payment_terms?: string | null
          payment_terms_days?: number | null
          phone?: string | null
          primary_contact?: string | null
          subsidiary_id?: string | null
          supplier_type?: string | null
          synced_at?: string | null
          tax_id?: string | null
          type?: string
          updated_at?: string
          withholding_tax_code_id?: string | null
        }
        Update: {
          address?: string | null
          brand_id?: string
          code?: string
          created_at?: string
          created_by?: string | null
          default_currency?: string
          default_expense_coa_id?: string | null
          default_tax_code_id?: string | null
          email?: string | null
          external_id?: string | null
          external_source?: string
          gl_payable_coa_id?: string | null
          id?: string
          is_active?: boolean
          is_withholding_required?: boolean | null
          metadata?: Json | null
          name?: string
          notes?: string | null
          payment_terms?: string | null
          payment_terms_days?: number | null
          phone?: string | null
          primary_contact?: string | null
          subsidiary_id?: string | null
          supplier_type?: string | null
          synced_at?: string | null
          tax_id?: string | null
          type?: string
          updated_at?: string
          withholding_tax_code_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "suppliers_default_expense_coa_id_fkey"
            columns: ["default_expense_coa_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "suppliers_default_tax_code_id_fkey"
            columns: ["default_tax_code_id"]
            isOneToOne: false
            referencedRelation: "tax_codes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "suppliers_gl_payable_coa_id_fkey"
            columns: ["gl_payable_coa_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "suppliers_subsidiary_id_fkey"
            columns: ["subsidiary_id"]
            isOneToOne: false
            referencedRelation: "subsidiaries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "suppliers_withholding_tax_code_id_fkey"
            columns: ["withholding_tax_code_id"]
            isOneToOne: false
            referencedRelation: "tax_codes"
            referencedColumns: ["id"]
          },
        ]
      }
      survey_responses: {
        Row: {
          brand_id: string
          created_at: string
          created_by: string | null
          id: string
          metadata: Json
          responded_at: string | null
          response_json: Json
          sent_at: string
          source_id: string | null
          source_module: string | null
          status: string
          target_customer_id: string | null
          target_user_id: string | null
          template_id: string
          token: string
          updated_at: string
        }
        Insert: {
          brand_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          metadata?: Json
          responded_at?: string | null
          response_json?: Json
          sent_at?: string
          source_id?: string | null
          source_module?: string | null
          status?: string
          target_customer_id?: string | null
          target_user_id?: string | null
          template_id: string
          token: string
          updated_at?: string
        }
        Update: {
          brand_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          metadata?: Json
          responded_at?: string | null
          response_json?: Json
          sent_at?: string
          source_id?: string | null
          source_module?: string | null
          status?: string
          target_customer_id?: string | null
          target_user_id?: string | null
          template_id?: string
          token?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "survey_responses_target_customer_id_fkey"
            columns: ["target_customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "survey_responses_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "survey_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      survey_templates: {
        Row: {
          brand_id: string
          code: string
          created_at: string
          created_by: string | null
          description: string | null
          effective_from: string | null
          effective_to: string | null
          id: string
          is_active: boolean
          kind: string
          metadata: Json
          name: string
          questions: Json
          target_segment: string | null
          updated_at: string
        }
        Insert: {
          brand_id: string
          code: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          effective_from?: string | null
          effective_to?: string | null
          id?: string
          is_active?: boolean
          kind: string
          metadata?: Json
          name: string
          questions?: Json
          target_segment?: string | null
          updated_at?: string
        }
        Update: {
          brand_id?: string
          code?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          effective_from?: string | null
          effective_to?: string | null
          id?: string
          is_active?: boolean
          kind?: string
          metadata?: Json
          name?: string
          questions?: Json
          target_segment?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      system_accounting_settings: {
        Row: {
          base_currency: string
          created_at: string
          current_year_pl_coa_id: string | null
          default_ap_coa_id: string | null
          default_ar_coa_id: string | null
          default_bank_coa_id: string | null
          default_cash_coa_id: string | null
          default_credit_card_coa_id: string | null
          fiscal_year_start_month: number
          fx_gain_coa_id: string | null
          fx_loss_coa_id: string | null
          input_vat_default_coa_id: string | null
          metadata: Json | null
          output_vat_default_coa_id: string | null
          retained_earnings_coa_id: string | null
          rounding_diff_gain_coa_id: string | null
          rounding_diff_loss_coa_id: string | null
          tenant_id: string
          updated_at: string
          updated_by: string | null
          vat_filing_period: string
          withholding_10_coa_id: string | null
          withholding_20_coa_id: string | null
          withholding_5_coa_id: string | null
        }
        Insert: {
          base_currency?: string
          created_at?: string
          current_year_pl_coa_id?: string | null
          default_ap_coa_id?: string | null
          default_ar_coa_id?: string | null
          default_bank_coa_id?: string | null
          default_cash_coa_id?: string | null
          default_credit_card_coa_id?: string | null
          fiscal_year_start_month?: number
          fx_gain_coa_id?: string | null
          fx_loss_coa_id?: string | null
          input_vat_default_coa_id?: string | null
          metadata?: Json | null
          output_vat_default_coa_id?: string | null
          retained_earnings_coa_id?: string | null
          rounding_diff_gain_coa_id?: string | null
          rounding_diff_loss_coa_id?: string | null
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
          vat_filing_period?: string
          withholding_10_coa_id?: string | null
          withholding_20_coa_id?: string | null
          withholding_5_coa_id?: string | null
        }
        Update: {
          base_currency?: string
          created_at?: string
          current_year_pl_coa_id?: string | null
          default_ap_coa_id?: string | null
          default_ar_coa_id?: string | null
          default_bank_coa_id?: string | null
          default_cash_coa_id?: string | null
          default_credit_card_coa_id?: string | null
          fiscal_year_start_month?: number
          fx_gain_coa_id?: string | null
          fx_loss_coa_id?: string | null
          input_vat_default_coa_id?: string | null
          metadata?: Json | null
          output_vat_default_coa_id?: string | null
          retained_earnings_coa_id?: string | null
          rounding_diff_gain_coa_id?: string | null
          rounding_diff_loss_coa_id?: string | null
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
          vat_filing_period?: string
          withholding_10_coa_id?: string | null
          withholding_20_coa_id?: string | null
          withholding_5_coa_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "system_accounting_settings_current_year_pl_coa_id_fkey"
            columns: ["current_year_pl_coa_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "system_accounting_settings_default_ap_coa_id_fkey"
            columns: ["default_ap_coa_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "system_accounting_settings_default_ar_coa_id_fkey"
            columns: ["default_ar_coa_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "system_accounting_settings_default_bank_coa_id_fkey"
            columns: ["default_bank_coa_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "system_accounting_settings_default_cash_coa_id_fkey"
            columns: ["default_cash_coa_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "system_accounting_settings_default_credit_card_coa_id_fkey"
            columns: ["default_credit_card_coa_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "system_accounting_settings_fx_gain_coa_id_fkey"
            columns: ["fx_gain_coa_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "system_accounting_settings_fx_loss_coa_id_fkey"
            columns: ["fx_loss_coa_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "system_accounting_settings_input_vat_default_coa_id_fkey"
            columns: ["input_vat_default_coa_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "system_accounting_settings_output_vat_default_coa_id_fkey"
            columns: ["output_vat_default_coa_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "system_accounting_settings_retained_earnings_coa_id_fkey"
            columns: ["retained_earnings_coa_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "system_accounting_settings_rounding_diff_gain_coa_id_fkey"
            columns: ["rounding_diff_gain_coa_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "system_accounting_settings_rounding_diff_loss_coa_id_fkey"
            columns: ["rounding_diff_loss_coa_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "system_accounting_settings_withholding_10_coa_id_fkey"
            columns: ["withholding_10_coa_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "system_accounting_settings_withholding_20_coa_id_fkey"
            columns: ["withholding_20_coa_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "system_accounting_settings_withholding_5_coa_id_fkey"
            columns: ["withholding_5_coa_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      tax_codes: {
        Row: {
          coa_id: string | null
          created_at: string
          description: string | null
          direction: string
          id: string
          is_active: boolean
          is_system_default: boolean
          name_zh_tw: string
          rate: number
          tax_code: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          coa_id?: string | null
          created_at?: string
          description?: string | null
          direction: string
          id?: string
          is_active?: boolean
          is_system_default?: boolean
          name_zh_tw: string
          rate: number
          tax_code: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          coa_id?: string | null
          created_at?: string
          description?: string | null
          direction?: string
          id?: string
          is_active?: boolean
          is_system_default?: boolean
          name_zh_tw?: string
          rate?: number
          tax_code?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tax_codes_coa_id_fkey"
            columns: ["coa_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      transaction_types: {
        Row: {
          cash_flow_section: string | null
          category: string
          code: string
          created_at: string
          created_by: string | null
          description: string | null
          display_order: number
          example_ctx: Json | null
          gl_template: Json
          id: string
          is_active: boolean
          is_system_default: boolean
          metadata: Json
          name_zh_tw: string
          required_inputs: Json
          tenant_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          cash_flow_section?: string | null
          category: string
          code: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          display_order?: number
          example_ctx?: Json | null
          gl_template: Json
          id?: string
          is_active?: boolean
          is_system_default?: boolean
          metadata?: Json
          name_zh_tw: string
          required_inputs?: Json
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          cash_flow_section?: string | null
          category?: string
          code?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          display_order?: number
          example_ctx?: Json | null
          gl_template?: Json
          id?: string
          is_active?: boolean
          is_system_default?: boolean
          metadata?: Json
          name_zh_tw?: string
          required_inputs?: Json
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      used_car_evaluations: {
        Row: {
          appraiser: string | null
          approved_at: string | null
          approved_by: string | null
          brand_id: string
          brand_name: string | null
          color: string | null
          conclusion: string | null
          condition_grade: string | null
          created_at: string | null
          customer_id: string | null
          decision: string | null
          displacement: string | null
          equipment_jsonb: Json | null
          estimated_value: number | null
          eval_no: string | null
          evaluator_id: string | null
          id: string
          license_plate: string | null
          metadata: Json | null
          mileage: number | null
          model: string | null
          organization_id: string | null
          pricing_jsonb: Json | null
          rejected_at: string | null
          rejected_by: string | null
          rejection_reason: string | null
          status: string
          submitted_at: string | null
          updated_at: string | null
          vin: string | null
          year: number | null
        }
        Insert: {
          appraiser?: string | null
          approved_at?: string | null
          approved_by?: string | null
          brand_id: string
          brand_name?: string | null
          color?: string | null
          conclusion?: string | null
          condition_grade?: string | null
          created_at?: string | null
          customer_id?: string | null
          decision?: string | null
          displacement?: string | null
          equipment_jsonb?: Json | null
          estimated_value?: number | null
          eval_no?: string | null
          evaluator_id?: string | null
          id?: string
          license_plate?: string | null
          metadata?: Json | null
          mileage?: number | null
          model?: string | null
          organization_id?: string | null
          pricing_jsonb?: Json | null
          rejected_at?: string | null
          rejected_by?: string | null
          rejection_reason?: string | null
          status?: string
          submitted_at?: string | null
          updated_at?: string | null
          vin?: string | null
          year?: number | null
        }
        Update: {
          appraiser?: string | null
          approved_at?: string | null
          approved_by?: string | null
          brand_id?: string
          brand_name?: string | null
          color?: string | null
          conclusion?: string | null
          condition_grade?: string | null
          created_at?: string | null
          customer_id?: string | null
          decision?: string | null
          displacement?: string | null
          equipment_jsonb?: Json | null
          estimated_value?: number | null
          eval_no?: string | null
          evaluator_id?: string | null
          id?: string
          license_plate?: string | null
          metadata?: Json | null
          mileage?: number | null
          model?: string | null
          organization_id?: string | null
          pricing_jsonb?: Json | null
          rejected_at?: string | null
          rejected_by?: string | null
          rejection_reason?: string | null
          status?: string
          submitted_at?: string | null
          updated_at?: string | null
          vin?: string | null
          year?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "used_car_evaluations_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      used_car_inventory: {
        Row: {
          acquisition_date: string | null
          acquisition_price: number | null
          acquisition_source: string | null
          brand_id: string
          color: string | null
          color_hex: string | null
          condition_grade: string | null
          cost: number | null
          created_at: string | null
          created_by: string | null
          id: string
          images: string[] | null
          inspection_due_date: string | null
          inspection_report: Json | null
          license_plate: string | null
          lien_cleared: boolean | null
          listed_date: string | null
          listing_price: number | null
          margin: number | null
          metadata: Json | null
          mileage_km: number | null
          model_display_name: string
          note: string | null
          organization_id: string | null
          recommended_services: string[] | null
          sold_date: string | null
          status: string
          updated_at: string | null
          updated_by: string | null
          vehicle_model_id: string | null
          vin: string | null
          year: number
        }
        Insert: {
          acquisition_date?: string | null
          acquisition_price?: number | null
          acquisition_source?: string | null
          brand_id: string
          color?: string | null
          color_hex?: string | null
          condition_grade?: string | null
          cost?: number | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          images?: string[] | null
          inspection_due_date?: string | null
          inspection_report?: Json | null
          license_plate?: string | null
          lien_cleared?: boolean | null
          listed_date?: string | null
          listing_price?: number | null
          margin?: number | null
          metadata?: Json | null
          mileage_km?: number | null
          model_display_name: string
          note?: string | null
          organization_id?: string | null
          recommended_services?: string[] | null
          sold_date?: string | null
          status?: string
          updated_at?: string | null
          updated_by?: string | null
          vehicle_model_id?: string | null
          vin?: string | null
          year: number
        }
        Update: {
          acquisition_date?: string | null
          acquisition_price?: number | null
          acquisition_source?: string | null
          brand_id?: string
          color?: string | null
          color_hex?: string | null
          condition_grade?: string | null
          cost?: number | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          images?: string[] | null
          inspection_due_date?: string | null
          inspection_report?: Json | null
          license_plate?: string | null
          lien_cleared?: boolean | null
          listed_date?: string | null
          listing_price?: number | null
          margin?: number | null
          metadata?: Json | null
          mileage_km?: number | null
          model_display_name?: string
          note?: string | null
          organization_id?: string | null
          recommended_services?: string[] | null
          sold_date?: string | null
          status?: string
          updated_at?: string | null
          updated_by?: string | null
          vehicle_model_id?: string | null
          vin?: string | null
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "used_car_inventory_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "used_car_inventory_vehicle_model_id_fkey"
            columns: ["vehicle_model_id"]
            isOneToOne: false
            referencedRelation: "vehicle_models"
            referencedColumns: ["id"]
          },
        ]
      }
      user_assignments: {
        Row: {
          expires_at: string | null
          granted_at: string
          granted_by: string | null
          id: string
          notes: string | null
          role_id: string
          scope_id: string
          scope_type: string
          user_id: string
        }
        Insert: {
          expires_at?: string | null
          granted_at?: string
          granted_by?: string | null
          id?: string
          notes?: string | null
          role_id: string
          scope_id: string
          scope_type: string
          user_id: string
        }
        Update: {
          expires_at?: string | null
          granted_at?: string
          granted_by?: string | null
          id?: string
          notes?: string | null
          role_id?: string
          scope_id?: string
          scope_type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_assignments_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_reminder_subscriptions: {
        Row: {
          brand_id: string
          created_at: string
          id: string
          is_visible: boolean
          reminder_code: string
          slot_index: number
          updated_at: string
          user_id: string
        }
        Insert: {
          brand_id: string
          created_at?: string
          id?: string
          is_visible?: boolean
          reminder_code: string
          slot_index: number
          updated_at?: string
          user_id: string
        }
        Update: {
          brand_id?: string
          created_at?: string
          id?: string
          is_visible?: boolean
          reminder_code?: string
          slot_index?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_reminder_subscriptions_reminder_code_fkey"
            columns: ["reminder_code"]
            isOneToOne: false
            referencedRelation: "reminder_definitions"
            referencedColumns: ["code"]
          },
        ]
      }
      vehicle_models: {
        Row: {
          brand_id: string
          created_at: string
          default_tax_code_id: string | null
          display_name: string
          engine_cc: number | null
          engine_kw: number | null
          gl_cogs_coa_id: string | null
          gl_inventory_coa_id: string | null
          gl_revenue_coa_id: string | null
          id: string
          is_active: boolean
          metadata: Json | null
          model_name: string
          msrp: number | null
          netsuite_segment_value_id: string | null
          netsuite_synced_at: string | null
          series: string
          standard_cost: number | null
          subsidiary_id: string | null
          updated_at: string
          vehicle_type: Database["public"]["Enums"]["vehicle_type"]
          year_end: number | null
          year_start: number | null
        }
        Insert: {
          brand_id?: string
          created_at?: string
          default_tax_code_id?: string | null
          display_name: string
          engine_cc?: number | null
          engine_kw?: number | null
          gl_cogs_coa_id?: string | null
          gl_inventory_coa_id?: string | null
          gl_revenue_coa_id?: string | null
          id?: string
          is_active?: boolean
          metadata?: Json | null
          model_name: string
          msrp?: number | null
          netsuite_segment_value_id?: string | null
          netsuite_synced_at?: string | null
          series: string
          standard_cost?: number | null
          subsidiary_id?: string | null
          updated_at?: string
          vehicle_type?: Database["public"]["Enums"]["vehicle_type"]
          year_end?: number | null
          year_start?: number | null
        }
        Update: {
          brand_id?: string
          created_at?: string
          default_tax_code_id?: string | null
          display_name?: string
          engine_cc?: number | null
          engine_kw?: number | null
          gl_cogs_coa_id?: string | null
          gl_inventory_coa_id?: string | null
          gl_revenue_coa_id?: string | null
          id?: string
          is_active?: boolean
          metadata?: Json | null
          model_name?: string
          msrp?: number | null
          netsuite_segment_value_id?: string | null
          netsuite_synced_at?: string | null
          series?: string
          standard_cost?: number | null
          subsidiary_id?: string | null
          updated_at?: string
          vehicle_type?: Database["public"]["Enums"]["vehicle_type"]
          year_end?: number | null
          year_start?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "vehicle_models_default_tax_code_id_fkey"
            columns: ["default_tax_code_id"]
            isOneToOne: false
            referencedRelation: "tax_codes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_models_gl_cogs_coa_id_fkey"
            columns: ["gl_cogs_coa_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_models_gl_inventory_coa_id_fkey"
            columns: ["gl_inventory_coa_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_models_gl_revenue_coa_id_fkey"
            columns: ["gl_revenue_coa_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_models_subsidiary_id_fkey"
            columns: ["subsidiary_id"]
            isOneToOne: false
            referencedRelation: "subsidiaries"
            referencedColumns: ["id"]
          },
        ]
      }
      warehouse_bins: {
        Row: {
          brand_id: string
          capacity: number | null
          code: string
          created_at: string
          id: string
          is_active: boolean
          metadata: Json | null
          name: string | null
          updated_at: string
          warehouse_id: string
          zone_id: string
        }
        Insert: {
          brand_id?: string
          capacity?: number | null
          code: string
          created_at?: string
          id?: string
          is_active?: boolean
          metadata?: Json | null
          name?: string | null
          updated_at?: string
          warehouse_id: string
          zone_id: string
        }
        Update: {
          brand_id?: string
          capacity?: number | null
          code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          metadata?: Json | null
          name?: string | null
          updated_at?: string
          warehouse_id?: string
          zone_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "warehouse_bins_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warehouse_bins_zone_id_fkey"
            columns: ["zone_id"]
            isOneToOne: false
            referencedRelation: "warehouse_zones"
            referencedColumns: ["id"]
          },
        ]
      }
      warehouse_slots: {
        Row: {
          abc_required: boolean
          bin_id: string
          brand_id: string
          code: string
          created_at: string
          id: string
          is_occupied: boolean
          metadata: Json | null
          position: string | null
          updated_at: string
          warehouse_id: string
        }
        Insert: {
          abc_required?: boolean
          bin_id: string
          brand_id?: string
          code: string
          created_at?: string
          id?: string
          is_occupied?: boolean
          metadata?: Json | null
          position?: string | null
          updated_at?: string
          warehouse_id: string
        }
        Update: {
          abc_required?: boolean
          bin_id?: string
          brand_id?: string
          code?: string
          created_at?: string
          id?: string
          is_occupied?: boolean
          metadata?: Json | null
          position?: string | null
          updated_at?: string
          warehouse_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "warehouse_slots_bin_id_fkey"
            columns: ["bin_id"]
            isOneToOne: false
            referencedRelation: "warehouse_bins"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warehouse_slots_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      warehouse_zones: {
        Row: {
          brand_id: string
          code: string
          control_level: string
          created_at: string
          id: string
          is_active: boolean
          metadata: Json | null
          name: string
          notes: string | null
          updated_at: string
          warehouse_id: string
        }
        Insert: {
          brand_id?: string
          code: string
          control_level?: string
          created_at?: string
          id?: string
          is_active?: boolean
          metadata?: Json | null
          name: string
          notes?: string | null
          updated_at?: string
          warehouse_id: string
        }
        Update: {
          brand_id?: string
          code?: string
          control_level?: string
          created_at?: string
          id?: string
          is_active?: boolean
          metadata?: Json | null
          name?: string
          notes?: string | null
          updated_at?: string
          warehouse_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "warehouse_zones_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      warehouses: {
        Row: {
          address: string | null
          brand_id: string
          code: string
          created_at: string
          external_id: string | null
          external_source: string
          id: string
          is_active: boolean
          is_warranty_staging: boolean
          metadata: Json | null
          name: string
          notes: string | null
          org_id: string | null
          sort_order: number
          synced_at: string | null
          type: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          brand_id?: string
          code: string
          created_at?: string
          external_id?: string | null
          external_source?: string
          id?: string
          is_active?: boolean
          is_warranty_staging?: boolean
          metadata?: Json | null
          name: string
          notes?: string | null
          org_id?: string | null
          sort_order?: number
          synced_at?: string | null
          type?: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          brand_id?: string
          code?: string
          created_at?: string
          external_id?: string | null
          external_source?: string
          id?: string
          is_active?: boolean
          is_warranty_staging?: boolean
          metadata?: Json | null
          name?: string
          notes?: string | null
          org_id?: string | null
          sort_order?: number
          synced_at?: string | null
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "warehouses_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      warranty_claim_lines: {
        Row: {
          applied_amount: number
          approved_amount: number | null
          brand_id: string
          cl_id: string
          created_at: string
          id: string
          item_id: string
          labor_cost: number
          line_no: number
          metadata: Json | null
          notes: string | null
          old_part_id: string | null
          parts_cost: number
          qty: number
          serial_no: string | null
          updated_at: string
        }
        Insert: {
          applied_amount: number
          approved_amount?: number | null
          brand_id?: string
          cl_id: string
          created_at?: string
          id?: string
          item_id: string
          labor_cost?: number
          line_no: number
          metadata?: Json | null
          notes?: string | null
          old_part_id?: string | null
          parts_cost?: number
          qty?: number
          serial_no?: string | null
          updated_at?: string
        }
        Update: {
          applied_amount?: number
          approved_amount?: number | null
          brand_id?: string
          cl_id?: string
          created_at?: string
          id?: string
          item_id?: string
          labor_cost?: number
          line_no?: number
          metadata?: Json | null
          notes?: string | null
          old_part_id?: string | null
          parts_cost?: number
          qty?: number
          serial_no?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "warranty_claim_lines_cl_id_fkey"
            columns: ["cl_id"]
            isOneToOne: false
            referencedRelation: "warranty_claims"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warranty_claim_lines_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
        ]
      }
      warranty_claims: {
        Row: {
          actual_receipt_date: string | null
          applied_amount: number
          approved_amount: number | null
          approved_at: string | null
          brand_id: string
          cl_no: string
          claim_date: string
          claim_type: string
          created_at: string
          created_by: string | null
          customer_id: string | null
          external_id: string | null
          external_source: string
          forecast_receipt_date: string | null
          gl_posted: boolean
          gl_posted_at: string | null
          id: string
          labor_cost: number
          metadata: Json | null
          notes: string | null
          oem_reference_no: string | null
          parts_cost: number
          received_at: string | null
          ro_id: string | null
          status: string
          submitted_at: string | null
          subsidiary_id: string | null
          synced_at: string | null
          updated_at: string
          vehicle_model_id: string | null
          vin: string | null
        }
        Insert: {
          actual_receipt_date?: string | null
          applied_amount?: number
          approved_amount?: number | null
          approved_at?: string | null
          brand_id?: string
          cl_no: string
          claim_date?: string
          claim_type: string
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          external_id?: string | null
          external_source?: string
          forecast_receipt_date?: string | null
          gl_posted?: boolean
          gl_posted_at?: string | null
          id?: string
          labor_cost?: number
          metadata?: Json | null
          notes?: string | null
          oem_reference_no?: string | null
          parts_cost?: number
          received_at?: string | null
          ro_id?: string | null
          status?: string
          submitted_at?: string | null
          subsidiary_id?: string | null
          synced_at?: string | null
          updated_at?: string
          vehicle_model_id?: string | null
          vin?: string | null
        }
        Update: {
          actual_receipt_date?: string | null
          applied_amount?: number
          approved_amount?: number | null
          approved_at?: string | null
          brand_id?: string
          cl_no?: string
          claim_date?: string
          claim_type?: string
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          external_id?: string | null
          external_source?: string
          forecast_receipt_date?: string | null
          gl_posted?: boolean
          gl_posted_at?: string | null
          id?: string
          labor_cost?: number
          metadata?: Json | null
          notes?: string | null
          oem_reference_no?: string | null
          parts_cost?: number
          received_at?: string | null
          ro_id?: string | null
          status?: string
          submitted_at?: string | null
          subsidiary_id?: string | null
          synced_at?: string | null
          updated_at?: string
          vehicle_model_id?: string | null
          vin?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "warranty_claims_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warranty_claims_ro_id_fkey"
            columns: ["ro_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warranty_claims_subsidiary_id_fkey"
            columns: ["subsidiary_id"]
            isOneToOne: false
            referencedRelation: "subsidiaries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warranty_claims_vehicle_model_id_fkey"
            columns: ["vehicle_model_id"]
            isOneToOne: false
            referencedRelation: "vehicle_models"
            referencedColumns: ["id"]
          },
        ]
      }
      work_order_items: {
        Row: {
          amount: number
          brand_id: string
          created_at: string
          description: string
          id: string
          is_warranty: boolean
          item_id: string | null
          kind: string
          labor_code: string | null
          labor_minutes: number | null
          line_no: number
          metadata: Json | null
          notes: string | null
          qty: number
          qty_allocated: number
          technician_id: string | null
          unit_price: number
          updated_at: string
          work_order_id: string
        }
        Insert: {
          amount?: number
          brand_id: string
          created_at?: string
          description: string
          id?: string
          is_warranty?: boolean
          item_id?: string | null
          kind: string
          labor_code?: string | null
          labor_minutes?: number | null
          line_no: number
          metadata?: Json | null
          notes?: string | null
          qty?: number
          qty_allocated?: number
          technician_id?: string | null
          unit_price?: number
          updated_at?: string
          work_order_id: string
        }
        Update: {
          amount?: number
          brand_id?: string
          created_at?: string
          description?: string
          id?: string
          is_warranty?: boolean
          item_id?: string | null
          kind?: string
          labor_code?: string | null
          labor_minutes?: number | null
          line_no?: number
          metadata?: Json | null
          notes?: string | null
          qty?: number
          qty_allocated?: number
          technician_id?: string | null
          unit_price?: number
          updated_at?: string
          work_order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_order_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_order_items_technician_id_fkey"
            columns: ["technician_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_order_items_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      work_orders: {
        Row: {
          advisor_id: string | null
          appointment_id: string | null
          brand_id: string
          closed_at: string | null
          created_at: string
          created_by: string | null
          customer_complaint: string | null
          customer_id: string
          diagnosis: string | null
          discount_amount: number
          dispatched_at: string | null
          external_amount: number
          external_id: string | null
          external_source: string
          id: string
          labor_amount: number
          lead_technician_id: string | null
          metadata: Json | null
          mileage_in: number | null
          mileage_out: number | null
          notes: string | null
          opened_at: string
          parts_amount: number
          qc_at: string | null
          ro_no: string
          status: string
          subsidiary_id: string | null
          synced_at: string | null
          total_amount: number
          updated_at: string
          vehicle_id: string
          work_summary: string | null
        }
        Insert: {
          advisor_id?: string | null
          appointment_id?: string | null
          brand_id: string
          closed_at?: string | null
          created_at?: string
          created_by?: string | null
          customer_complaint?: string | null
          customer_id: string
          diagnosis?: string | null
          discount_amount?: number
          dispatched_at?: string | null
          external_amount?: number
          external_id?: string | null
          external_source?: string
          id?: string
          labor_amount?: number
          lead_technician_id?: string | null
          metadata?: Json | null
          mileage_in?: number | null
          mileage_out?: number | null
          notes?: string | null
          opened_at?: string
          parts_amount?: number
          qc_at?: string | null
          ro_no: string
          status?: string
          subsidiary_id?: string | null
          synced_at?: string | null
          total_amount?: number
          updated_at?: string
          vehicle_id: string
          work_summary?: string | null
        }
        Update: {
          advisor_id?: string | null
          appointment_id?: string | null
          brand_id?: string
          closed_at?: string | null
          created_at?: string
          created_by?: string | null
          customer_complaint?: string | null
          customer_id?: string
          diagnosis?: string | null
          discount_amount?: number
          dispatched_at?: string | null
          external_amount?: number
          external_id?: string | null
          external_source?: string
          id?: string
          labor_amount?: number
          lead_technician_id?: string | null
          metadata?: Json | null
          mileage_in?: number | null
          mileage_out?: number | null
          notes?: string | null
          opened_at?: string
          parts_amount?: number
          qc_at?: string | null
          ro_no?: string
          status?: string
          subsidiary_id?: string | null
          synced_at?: string | null
          total_amount?: number
          updated_at?: string
          vehicle_id?: string
          work_summary?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "work_orders_advisor_id_fkey"
            columns: ["advisor_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_orders_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "service_appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_orders_lead_technician_id_fkey"
            columns: ["lead_technician_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_orders_subsidiary_id_fkey"
            columns: ["subsidiary_id"]
            isOneToOne: false
            referencedRelation: "subsidiaries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_orders_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "customer_vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      v_inventory_turnover: {
        Row: {
          abc_class: string | null
          amount_out_12m: number | null
          avg_unit_cost: number | null
          brand_id: string | null
          days_of_stock: number | null
          item_code: string | null
          item_id: string | null
          item_name: string | null
          qty_on_hand: number | null
          qty_out_12m: number | null
          turnover_rate_12m: number | null
          warehouse_code: string | null
          warehouse_id: string | null
          warehouse_name: string | null
        }
        Relationships: []
      }
      v_stale_inventory: {
        Row: {
          abc_class: string | null
          avg_unit_cost: number | null
          brand_id: string | null
          days_no_movement: number | null
          item_category: string | null
          item_code: string | null
          item_id: string | null
          item_name: string | null
          last_movement_at: string | null
          qty_on_hand: number | null
          stale_amount: number | null
          stale_severity: string | null
          warehouse_code: string | null
          warehouse_id: string | null
          warehouse_name: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_items_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      v_stock_balances: {
        Row: {
          abc_class: string | null
          avg_unit_cost: number | null
          brand_id: string | null
          item_category: string | null
          item_code: string | null
          item_id: string | null
          item_name: string | null
          last_movement_at: string | null
          qty_available: number | null
          qty_consignment: number | null
          qty_frozen: number | null
          qty_in_transit: number | null
          qty_quarantine: number | null
          qty_reserved: number | null
          qty_total: number | null
          uom: string | null
          warehouse_code: string | null
          warehouse_id: string | null
          warehouse_name: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_items_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      calculate_replenishment: {
        Args: {
          p_brand: string
          p_horizon_days?: number
          p_trigger_kind?: string
          p_triggered_by?: string
          p_warehouse_id?: string
        }
        Returns: string
      }
      org_soft_delete_region: {
        Args: { p_region_id: string }
        Returns: undefined
      }
      org_soft_delete_store: {
        Args: { p_store_id: string }
        Returns: undefined
      }
      pos_decrement_stock: {
        Args: { p_product_id: string; p_qty: number }
        Returns: undefined
      }
      procurement_approve_return: {
        Args: { p_rt_id: string }
        Returns: {
          amount_total: number
          approved_at: string | null
          approved_by: string | null
          brand_id: string
          created_at: string
          created_by: string | null
          external_id: string | null
          external_source: string
          gl_posted: boolean
          gl_posted_at: string | null
          id: string
          logistics_provider: string | null
          logistics_tracking_no: string | null
          metadata: Json | null
          notes: string | null
          po_id: string | null
          qty_return_total: number
          refund_amount: number | null
          return_date: string
          return_reason: string
          rt_no: string
          status: string
          synced_at: string | null
          updated_at: string
          vendor_id: string
          warehouse_id: string
        }
        SetofOptions: {
          from: "*"
          to: "purchase_returns"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      procurement_cancel_return: {
        Args: { p_reason: string; p_rt_id: string }
        Returns: {
          amount_total: number
          approved_at: string | null
          approved_by: string | null
          brand_id: string
          created_at: string
          created_by: string | null
          external_id: string | null
          external_source: string
          gl_posted: boolean
          gl_posted_at: string | null
          id: string
          logistics_provider: string | null
          logistics_tracking_no: string | null
          metadata: Json | null
          notes: string | null
          po_id: string | null
          qty_return_total: number
          refund_amount: number | null
          return_date: string
          return_reason: string
          rt_no: string
          status: string
          synced_at: string | null
          updated_at: string
          vendor_id: string
          warehouse_id: string
        }
        SetofOptions: {
          from: "*"
          to: "purchase_returns"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      procurement_complete_return: {
        Args: { p_refund_amount?: number; p_rt_id: string }
        Returns: {
          amount_total: number
          approved_at: string | null
          approved_by: string | null
          brand_id: string
          created_at: string
          created_by: string | null
          external_id: string | null
          external_source: string
          gl_posted: boolean
          gl_posted_at: string | null
          id: string
          logistics_provider: string | null
          logistics_tracking_no: string | null
          metadata: Json | null
          notes: string | null
          po_id: string | null
          qty_return_total: number
          refund_amount: number | null
          return_date: string
          return_reason: string
          rt_no: string
          status: string
          synced_at: string | null
          updated_at: string
          vendor_id: string
          warehouse_id: string
        }
        SetofOptions: {
          from: "*"
          to: "purchase_returns"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      procurement_create_return: {
        Args: {
          p_brand_id: string
          p_lines: Json
          p_notes: string
          p_po_id: string
          p_return_reason: string
          p_warehouse_id: string
        }
        Returns: {
          amount_total: number
          approved_at: string | null
          approved_by: string | null
          brand_id: string
          created_at: string
          created_by: string | null
          external_id: string | null
          external_source: string
          gl_posted: boolean
          gl_posted_at: string | null
          id: string
          logistics_provider: string | null
          logistics_tracking_no: string | null
          metadata: Json | null
          notes: string | null
          po_id: string | null
          qty_return_total: number
          refund_amount: number | null
          return_date: string
          return_reason: string
          rt_no: string
          status: string
          synced_at: string | null
          updated_at: string
          vendor_id: string
          warehouse_id: string
        }
        SetofOptions: {
          from: "*"
          to: "purchase_returns"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      procurement_next_gi_no: { Args: { p_brand_id: string }; Returns: string }
      procurement_next_rt_no: { Args: { p_brand_id: string }; Returns: string }
      procurement_ship_return: {
        Args: { p_provider: string; p_rt_id: string; p_tracking_no: string }
        Returns: {
          amount_total: number
          approved_at: string | null
          approved_by: string | null
          brand_id: string
          created_at: string
          created_by: string | null
          external_id: string | null
          external_source: string
          gl_posted: boolean
          gl_posted_at: string | null
          id: string
          logistics_provider: string | null
          logistics_tracking_no: string | null
          metadata: Json | null
          notes: string | null
          po_id: string | null
          qty_return_total: number
          refund_amount: number | null
          return_date: string
          return_reason: string
          rt_no: string
          status: string
          synced_at: string | null
          updated_at: string
          vendor_id: string
          warehouse_id: string
        }
        SetofOptions: {
          from: "*"
          to: "purchase_returns"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      supplier_soft_delete: {
        Args: { p_supplier_id: string }
        Returns: undefined
      }
      user_has_brand: { Args: { p_brand: string }; Returns: boolean }
      user_has_subsidiary: {
        Args: { p_subsidiary_id: string }
        Returns: boolean
      }
      warehouse_soft_delete_zone: {
        Args: { p_zone_id: string }
        Returns: undefined
      }
    }
    Enums: {
      coa_l1_category:
        | "ASSET"
        | "LIABILITY"
        | "EQUITY"
        | "REVENUE"
        | "COGS"
        | "EXPENSE"
        | "NON_OPERATING"
        | "TAX"
      coa_level:
        | "L1_CATEGORY"
        | "L2_SUBCATEGORY"
        | "L3_MOEA"
        | "L4_PARENT"
        | "L5_DETAIL"
      dealer_category:
        | "GENERAL"
        | "VEHICLE_SALES"
        | "VEHICLE_INV"
        | "SERVICE"
        | "PARTS"
        | "INSURANCE"
        | "FINANCE"
      feedback_status: "draft" | "in_progress" | "review" | "released"
      tax_treatment:
        | "NORMAL"
        | "VAT_OUTPUT"
        | "VAT_INPUT"
        | "EXEMPT"
        | "WITHHOLDING"
        | "DEFERRED"
        | "ZERO_RATED"
      vehicle_type: "motorcycle" | "car" | "ev"
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
      coa_l1_category: [
        "ASSET",
        "LIABILITY",
        "EQUITY",
        "REVENUE",
        "COGS",
        "EXPENSE",
        "NON_OPERATING",
        "TAX",
      ],
      coa_level: [
        "L1_CATEGORY",
        "L2_SUBCATEGORY",
        "L3_MOEA",
        "L4_PARENT",
        "L5_DETAIL",
      ],
      dealer_category: [
        "GENERAL",
        "VEHICLE_SALES",
        "VEHICLE_INV",
        "SERVICE",
        "PARTS",
        "INSURANCE",
        "FINANCE",
      ],
      feedback_status: ["draft", "in_progress", "review", "released"],
      tax_treatment: [
        "NORMAL",
        "VAT_OUTPUT",
        "VAT_INPUT",
        "EXEMPT",
        "WITHHOLDING",
        "DEFERRED",
        "ZERO_RATED",
      ],
      vehicle_type: ["motorcycle", "car", "ev"],
    },
  },
} as const

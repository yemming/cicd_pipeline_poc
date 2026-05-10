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
      alert_events: {
        Row: {
          acked_at: string | null
          acked_by: string | null
          brand_id: string
          created_at: string
          id: string
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
          id: string
          manufacturer: string | null
          name: string
          netsuite_segment_value_id: string | null
          netsuite_synced_at: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id: string
          manufacturer?: string | null
          name: string
          netsuite_segment_value_id?: string | null
          netsuite_synced_at?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          manufacturer?: string | null
          name?: string
          netsuite_segment_value_id?: string | null
          netsuite_synced_at?: string | null
          updated_at?: string
        }
        Relationships: []
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
      count_review_rules: {
        Row: {
          action: string | null
          badge_color: string
          badge_label: string
          brand_id: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          panel_color: string
          rule_code: string
          rule_name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          action?: string | null
          badge_color?: string
          badge_label: string
          brand_id: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          panel_color?: string
          rule_code: string
          rule_name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          action?: string | null
          badge_color?: string
          badge_label?: string
          brand_id?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          panel_color?: string
          rule_code?: string
          rule_name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      count_tolerance_config: {
        Row: {
          brand_id: string
          notes: string | null
          tolerance_a_pct: number
          tolerance_b_pct: number
          tolerance_c_pct: number
          updated_at: string
          updated_by: string | null
          warning_text: string | null
        }
        Insert: {
          brand_id: string
          notes?: string | null
          tolerance_a_pct?: number
          tolerance_b_pct?: number
          tolerance_c_pct?: number
          updated_at?: string
          updated_by?: string | null
          warning_text?: string | null
        }
        Update: {
          brand_id?: string
          notes?: string | null
          tolerance_a_pct?: number
          tolerance_b_pct?: number
          tolerance_c_pct?: number
          updated_at?: string
          updated_by?: string | null
          warning_text?: string | null
        }
        Relationships: []
      }
      customer_contacts: {
        Row: {
          brand_id: string
          created_at: string
          customer_id: string
          email: string | null
          id: string
          is_active: boolean
          name: string
          notes: string | null
          phone: string | null
          relation: string | null
          role: string
          updated_at: string
        }
        Insert: {
          brand_id: string
          created_at?: string
          customer_id: string
          email?: string | null
          id?: string
          is_active?: boolean
          name: string
          notes?: string | null
          phone?: string | null
          relation?: string | null
          role?: string
          updated_at?: string
        }
        Update: {
          brand_id?: string
          created_at?: string
          customer_id?: string
          email?: string | null
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          phone?: string | null
          relation?: string | null
          role?: string
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
        ]
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
          model_id: string | null
          next_service_due_date: string | null
          next_service_due_mileage: number | null
          notes: string | null
          preferred_technician_id: string | null
          purchase_amount: number | null
          purchase_date: string | null
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
          model_id?: string | null
          next_service_due_date?: string | null
          next_service_due_mileage?: number | null
          notes?: string | null
          preferred_technician_id?: string | null
          purchase_amount?: number | null
          purchase_date?: string | null
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
          model_id?: string | null
          next_service_due_date?: string | null
          next_service_due_mileage?: number | null
          notes?: string | null
          preferred_technician_id?: string | null
          purchase_amount?: number | null
          purchase_date?: string | null
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
        ]
      }
      customers: {
        Row: {
          address: string | null
          birthday: string | null
          brand_id: string
          code: string
          created_at: string
          created_by: string | null
          email: string | null
          external_id: string | null
          external_source: string
          gl_receivable_coa_id: string | null
          id: string
          is_active: boolean
          name: string
          national_id: string | null
          notes: string | null
          phone: string | null
          source_module: string | null
          synced_at: string | null
          tax_id: string | null
          type: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          birthday?: string | null
          brand_id?: string
          code: string
          created_at?: string
          created_by?: string | null
          email?: string | null
          external_id?: string | null
          external_source?: string
          gl_receivable_coa_id?: string | null
          id?: string
          is_active?: boolean
          name: string
          national_id?: string | null
          notes?: string | null
          phone?: string | null
          source_module?: string | null
          synced_at?: string | null
          tax_id?: string | null
          type?: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          birthday?: string | null
          brand_id?: string
          code?: string
          created_at?: string
          created_by?: string | null
          email?: string | null
          external_id?: string | null
          external_source?: string
          gl_receivable_coa_id?: string | null
          id?: string
          is_active?: boolean
          name?: string
          national_id?: string | null
          notes?: string | null
          phone?: string | null
          source_module?: string | null
          synced_at?: string | null
          tax_id?: string | null
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customers_gl_receivable_coa_id_fkey"
            columns: ["gl_receivable_coa_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
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
          name: string
          netsuite_department_id: string | null
          netsuite_synced_at: string | null
          parent_id: string | null
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
          name: string
          netsuite_department_id?: string | null
          netsuite_synced_at?: string | null
          parent_id?: string | null
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
          name?: string
          netsuite_department_id?: string | null
          netsuite_synced_at?: string | null
          parent_id?: string | null
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
          notes?: string | null
          pattern?: string
          prefix?: string
          reset_period?: string
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
          name: string
          national_id: string | null
          notes: string | null
          pay_rate: number | null
          phone: string | null
          position: string | null
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
          name: string
          national_id?: string | null
          notes?: string | null
          pay_rate?: number | null
          phone?: string | null
          position?: string | null
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
          name?: string
          national_id?: string | null
          notes?: string | null
          pay_rate?: number | null
          phone?: string | null
          position?: string | null
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
        ]
      }
      feedback_canvas_snapshots: {
        Row: {
          brand_id: string
          snapshot: Json
          ticket_id: string
          updated_at: string
        }
        Insert: {
          brand_id?: string
          snapshot?: Json
          ticket_id: string
          updated_at?: string
        }
        Update: {
          brand_id?: string
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
          parent_id: string | null
          ticket_id: string
        }
        Insert: {
          author_id?: string | null
          body: string
          brand_id?: string
          created_at?: string
          id?: string
          parent_id?: string | null
          ticket_id: string
        }
        Update: {
          author_id?: string | null
          body?: string
          brand_id?: string
          created_at?: string
          id?: string
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
      feedback_sticky_notes: {
        Row: {
          body: string
          brand_id: string
          color: string
          created_at: string
          created_by: string | null
          id: string
          page_path: string
          page_title: string | null
          resolved_at: string | null
          ticket_id: string | null
          updated_at: string
          x_px: number
          y_px: number
        }
        Insert: {
          body?: string
          brand_id?: string
          color?: string
          created_at?: string
          created_by?: string | null
          id?: string
          page_path: string
          page_title?: string | null
          resolved_at?: string | null
          ticket_id?: string | null
          updated_at?: string
          x_px?: number
          y_px?: number
        }
        Update: {
          body?: string
          brand_id?: string
          color?: string
          created_at?: string
          created_by?: string | null
          id?: string
          page_path?: string
          page_title?: string | null
          resolved_at?: string | null
          ticket_id?: string | null
          updated_at?: string
          x_px?: number
          y_px?: number
        }
        Relationships: [
          {
            foreignKeyName: "feedback_sticky_notes_ticket_id_fkey"
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
          status?: Database["public"]["Enums"]["feedback_status"]
          title?: string
          updated_at?: string
          url?: string | null
        }
        Relationships: []
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
          created_at: string
          created_by: string | null
          ct_no: string
          first_counter_id: string | null
          freeze_warehouse: boolean
          id: string
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
          created_at?: string
          created_by?: string | null
          ct_no: string
          first_counter_id?: string | null
          freeze_warehouse?: boolean
          id?: string
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
          created_at?: string
          created_by?: string | null
          ct_no?: string
          first_counter_id?: string | null
          freeze_warehouse?: boolean
          id?: string
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
      item_permission_features: {
        Row: {
          brand_id: string
          created_at: string
          description: string | null
          feature_code: string
          feature_name: string
          group_code: string
          group_name: string
          group_sort_order: number
          id: string
          is_active: boolean
          sort_order: number
          updated_at: string
        }
        Insert: {
          brand_id: string
          created_at?: string
          description?: string | null
          feature_code: string
          feature_name: string
          group_code: string
          group_name: string
          group_sort_order?: number
          id?: string
          is_active?: boolean
          sort_order?: number
          updated_at?: string
        }
        Update: {
          brand_id?: string
          created_at?: string
          description?: string | null
          feature_code?: string
          feature_name?: string
          group_code?: string
          group_name?: string
          group_sort_order?: number
          id?: string
          is_active?: boolean
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      item_permission_grants: {
        Row: {
          brand_id: string
          feature_id: string
          granted: boolean
          role_id: string
          updated_at: string
        }
        Insert: {
          brand_id: string
          feature_id: string
          granted?: boolean
          role_id: string
          updated_at?: string
        }
        Update: {
          brand_id?: string
          feature_id?: string
          granted?: boolean
          role_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "item_permission_grants_feature_id_fkey"
            columns: ["feature_id"]
            isOneToOne: false
            referencedRelation: "item_permission_features"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "item_permission_grants_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "item_permission_roles"
            referencedColumns: ["id"]
          },
        ]
      }
      item_permission_roles: {
        Row: {
          brand_id: string
          created_at: string
          id: string
          is_active: boolean
          role_code: string
          role_name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          brand_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          role_code: string
          role_name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          brand_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          role_code?: string
          role_name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      item_skus: {
        Row: {
          brand_id: string
          created_at: string
          id: string
          is_primary: boolean
          item_id: string
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
          external_id: string | null
          external_source: string
          gl_cogs_coa_id: string | null
          gl_inventory_coa_id: string | null
          gl_revenue_coa_id: string | null
          id: string
          image_display_height: number
          image_url: string | null
          is_active: boolean
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
          external_id?: string | null
          external_source?: string
          gl_cogs_coa_id?: string | null
          gl_inventory_coa_id?: string | null
          gl_revenue_coa_id?: string | null
          id?: string
          image_display_height?: number
          image_url?: string | null
          is_active?: boolean
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
          external_id?: string | null
          external_source?: string
          gl_cogs_coa_id?: string | null
          gl_inventory_coa_id?: string | null
          gl_revenue_coa_id?: string | null
          id?: string
          image_display_height?: number
          image_url?: string | null
          is_active?: boolean
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
            foreignKeyName: "items_gl_cogs_coa_id_fkey"
            columns: ["gl_cogs_coa_id"]
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
          created_at: string
          created_by: string | null
          description: string | null
          entry_date: string
          entry_no: string
          id: string
          netsuite_journal_id: string | null
          netsuite_synced_at: string | null
          posted_at: string | null
          posted_by: string | null
          reversed_by_entry_id: string | null
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          entry_date: string
          entry_no: string
          id?: string
          netsuite_journal_id?: string | null
          netsuite_synced_at?: string | null
          posted_at?: string | null
          posted_by?: string | null
          reversed_by_entry_id?: string | null
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          entry_date?: string
          entry_no?: string
          id?: string
          netsuite_journal_id?: string | null
          netsuite_synced_at?: string | null
          posted_at?: string | null
          posted_by?: string | null
          reversed_by_entry_id?: string | null
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "journal_entries_reversed_by_entry_id_fkey"
            columns: ["reversed_by_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
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
          role_label?: string | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      parts_control_types: {
        Row: {
          accent_color: string
          brand_id: string
          class_code: string
          class_name: string
          count_frequency: string | null
          created_at: string
          example_text: string | null
          id: string
          is_active: boolean
          issue_review_color: string
          issue_review_label: string | null
          price_basis: string | null
          serial_tracking_color: string
          serial_tracking_label: string | null
          sort_order: number
          tolerance_pct: number | null
          updated_at: string
        }
        Insert: {
          accent_color?: string
          brand_id: string
          class_code: string
          class_name: string
          count_frequency?: string | null
          created_at?: string
          example_text?: string | null
          id?: string
          is_active?: boolean
          issue_review_color?: string
          issue_review_label?: string | null
          price_basis?: string | null
          serial_tracking_color?: string
          serial_tracking_label?: string | null
          sort_order?: number
          tolerance_pct?: number | null
          updated_at?: string
        }
        Update: {
          accent_color?: string
          brand_id?: string
          class_code?: string
          class_name?: string
          count_frequency?: string | null
          created_at?: string
          example_text?: string | null
          id?: string
          is_active?: boolean
          issue_review_color?: string
          issue_review_label?: string | null
          price_basis?: string | null
          serial_tracking_color?: string
          serial_tracking_label?: string | null
          sort_order?: number
          tolerance_pct?: number | null
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
      parts_serial_tracking_rules: {
        Row: {
          brand_id: string
          class_code: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          is_locked: boolean
          is_required: boolean
          panel_color: string
          rule_label: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          brand_id: string
          class_code: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_locked?: boolean
          is_required?: boolean
          panel_color?: string
          rule_label: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          brand_id?: string
          class_code?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_locked?: boolean
          is_required?: boolean
          panel_color?: string
          rule_label?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      parts_warehouse_layer_meta: {
        Row: {
          accent_color: string
          badge_color: string
          badge_text: string | null
          brand_id: string
          created_at: string
          description: string | null
          icon: string | null
          id: string
          is_active: boolean
          layer_index: number
          layer_name: string
          layer_title: string
          updated_at: string
        }
        Insert: {
          accent_color?: string
          badge_color?: string
          badge_text?: string | null
          brand_id: string
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean
          layer_index: number
          layer_name: string
          layer_title: string
          updated_at?: string
        }
        Update: {
          accent_color?: string
          badge_color?: string
          badge_text?: string | null
          brand_id?: string
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean
          layer_index?: number
          layer_name?: string
          layer_title?: string
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
          monthly_report_auto?: boolean
          monthly_report_to_manager?: boolean
          remind_7_days_before?: boolean
          sync_finance_system?: boolean
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
          updated_at?: string
        }
        Relationships: []
      }
      parts_warranty_used_parts_config: {
        Row: {
          auto_link_cost_recovery: boolean
          auto_update_claim: boolean
          brand_id: string
          created_at: string
          inbound_warehouse: string
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
          id: string
          invoice_type: string
          merchant_trade_no: string
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
          id?: string
          invoice_type?: string
          merchant_trade_no: string
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
          id?: string
          invoice_type?: string
          merchant_trade_no?: string
          payment_method?: string
          staff_id?: string | null
          staff_name?: string
          tax_id?: string | null
          total_amount?: number
        }
        Relationships: []
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
      profiles: {
        Row: {
          id: string
          name: string | null
          updated_at: string | null
        }
        Insert: {
          id: string
          name?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          name?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      purchase_approval_flows: {
        Row: {
          brand_id: string
          color_tag: string
          created_at: string
          description: string | null
          emoji: string | null
          flow_name: string
          flow_type: string
          id: string
          is_active: boolean
          sort_order: number
          steps: Json
          updated_at: string
        }
        Insert: {
          brand_id: string
          color_tag?: string
          created_at?: string
          description?: string | null
          emoji?: string | null
          flow_name: string
          flow_type: string
          id?: string
          is_active?: boolean
          sort_order?: number
          steps?: Json
          updated_at?: string
        }
        Update: {
          brand_id?: string
          color_tag?: string
          created_at?: string
          description?: string | null
          emoji?: string | null
          flow_name?: string
          flow_type?: string
          id?: string
          is_active?: boolean
          sort_order?: number
          steps?: Json
          updated_at?: string
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
      purchase_permission_rules: {
        Row: {
          brand_id: string
          created_at: string
          id: string
          is_active: boolean
          monthly_limit: number | null
          notes: string | null
          requires_approval: boolean
          role_code: string
          role_name: string
          single_limit: number | null
          sort_order: number
          store_id: string | null
          updated_at: string
        }
        Insert: {
          brand_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          monthly_limit?: number | null
          notes?: string | null
          requires_approval?: boolean
          role_code: string
          role_name: string
          single_limit?: number | null
          sort_order?: number
          store_id?: string | null
          updated_at?: string
        }
        Update: {
          brand_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          monthly_limit?: number | null
          notes?: string | null
          requires_approval?: boolean
          role_code?: string
          role_name?: string
          single_limit?: number | null
          sort_order?: number
          store_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_permission_rules_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "organizations"
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
          created_at: string
          created_by: string | null
          external_id: string | null
          external_source: string
          id: string
          notes: string | null
          org_id: string | null
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
          created_at?: string
          created_by?: string | null
          external_id?: string | null
          external_source?: string
          id?: string
          notes?: string | null
          org_id?: string | null
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
          created_at?: string
          created_by?: string | null
          external_id?: string | null
          external_source?: string
          id?: string
          notes?: string | null
          org_id?: string | null
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
          notes: string | null
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
          notes?: string | null
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
          notes?: string | null
          updated_at?: string
          warehouse_id?: string | null
        }
        Relationships: [
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
          created_at: string
          external_id: string | null
          external_source: string
          id: string
          item_id: string
          last_movement_at: string
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
          created_at?: string
          external_id?: string | null
          external_source?: string
          id?: string
          item_id: string
          last_movement_at?: string
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
          created_at?: string
          external_id?: string | null
          external_source?: string
          id?: string
          item_id?: string
          last_movement_at?: string
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
          email: string | null
          external_id: string | null
          external_source: string
          gl_payable_coa_id: string | null
          id: string
          is_active: boolean
          name: string
          notes: string | null
          payment_terms: string | null
          phone: string | null
          primary_contact: string | null
          synced_at: string | null
          tax_id: string | null
          type: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          brand_id?: string
          code: string
          created_at?: string
          created_by?: string | null
          default_currency?: string
          email?: string | null
          external_id?: string | null
          external_source?: string
          gl_payable_coa_id?: string | null
          id?: string
          is_active?: boolean
          name: string
          notes?: string | null
          payment_terms?: string | null
          phone?: string | null
          primary_contact?: string | null
          synced_at?: string | null
          tax_id?: string | null
          type?: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          brand_id?: string
          code?: string
          created_at?: string
          created_by?: string | null
          default_currency?: string
          email?: string | null
          external_id?: string | null
          external_source?: string
          gl_payable_coa_id?: string | null
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          payment_terms?: string | null
          phone?: string | null
          primary_contact?: string | null
          synced_at?: string | null
          tax_id?: string | null
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "suppliers_gl_payable_coa_id_fkey"
            columns: ["gl_payable_coa_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
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
      vehicle_models: {
        Row: {
          brand_id: string
          created_at: string
          display_name: string
          engine_cc: number | null
          engine_kw: number | null
          id: string
          is_active: boolean
          model_name: string
          netsuite_segment_value_id: string | null
          netsuite_synced_at: string | null
          series: string
          updated_at: string
          vehicle_type: Database["public"]["Enums"]["vehicle_type"]
          year_end: number | null
          year_start: number | null
        }
        Insert: {
          brand_id?: string
          created_at?: string
          display_name: string
          engine_cc?: number | null
          engine_kw?: number | null
          id?: string
          is_active?: boolean
          model_name: string
          netsuite_segment_value_id?: string | null
          netsuite_synced_at?: string | null
          series: string
          updated_at?: string
          vehicle_type?: Database["public"]["Enums"]["vehicle_type"]
          year_end?: number | null
          year_start?: number | null
        }
        Update: {
          brand_id?: string
          created_at?: string
          display_name?: string
          engine_cc?: number | null
          engine_kw?: number | null
          id?: string
          is_active?: boolean
          model_name?: string
          netsuite_segment_value_id?: string | null
          netsuite_synced_at?: string | null
          series?: string
          updated_at?: string
          vehicle_type?: Database["public"]["Enums"]["vehicle_type"]
          year_end?: number | null
          year_start?: number | null
        }
        Relationships: []
      }
      warehouse_bins: {
        Row: {
          brand_id: string
          capacity: number | null
          code: string
          created_at: string
          id: string
          is_active: boolean
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
          name: string
          notes: string | null
          org_id: string | null
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
          name: string
          notes?: string | null
          org_id?: string | null
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
          name?: string
          notes?: string | null
          org_id?: string | null
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
          notes: string | null
          oem_reference_no: string | null
          parts_cost: number
          received_at: string | null
          ro_id: string | null
          status: string
          submitted_at: string | null
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
          notes?: string | null
          oem_reference_no?: string | null
          parts_cost?: number
          received_at?: string | null
          ro_id?: string | null
          status?: string
          submitted_at?: string | null
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
          notes?: string | null
          oem_reference_no?: string | null
          parts_cost?: number
          received_at?: string | null
          ro_id?: string | null
          status?: string
          submitted_at?: string | null
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
          mileage_in: number | null
          mileage_out: number | null
          notes: string | null
          opened_at: string
          parts_amount: number
          qc_at: string | null
          ro_no: string
          status: string
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
          mileage_in?: number | null
          mileage_out?: number | null
          notes?: string | null
          opened_at?: string
          parts_amount?: number
          qc_at?: string | null
          ro_no: string
          status?: string
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
          mileage_in?: number | null
          mileage_out?: number | null
          notes?: string | null
          opened_at?: string
          parts_amount?: number
          qc_at?: string | null
          ro_no?: string
          status?: string
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
      pos_decrement_stock: {
        Args: { p_product_id: string; p_qty: number }
        Returns: undefined
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      user_has_brand: { Args: { p_brand: string }; Returns: boolean }
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


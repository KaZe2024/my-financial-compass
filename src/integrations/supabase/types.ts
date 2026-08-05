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
      advisor_actions: {
        Row: {
          category: string
          created_at: string
          id: string
          impact: number
          notes: string | null
          plan_item_id: string | null
          rec_key: string
          resolved_at: string | null
          snooze_until: string | null
          status: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          category?: string
          created_at?: string
          id?: string
          impact?: number
          notes?: string | null
          plan_item_id?: string | null
          rec_key: string
          resolved_at?: string | null
          snooze_until?: string | null
          status?: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          category?: string
          created_at?: string
          id?: string
          impact?: number
          notes?: string | null
          plan_item_id?: string | null
          rec_key?: string
          resolved_at?: string | null
          snooze_until?: string | null
          status?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "advisor_actions_plan_item_id_fkey"
            columns: ["plan_item_id"]
            isOneToOne: false
            referencedRelation: "plan_items"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_insights: {
        Row: {
          body: string | null
          created_at: string
          dismissed_at: string | null
          id: string
          kind: string
          meta: Json | null
          severity: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          dismissed_at?: string | null
          id?: string
          kind: string
          meta?: Json | null
          severity?: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          dismissed_at?: string | null
          id?: string
          kind?: string
          meta?: Json | null
          severity?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      analytical_tags: {
        Row: {
          color: string | null
          created_at: string
          id: string
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          id?: string
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          color?: string | null
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      asset_events: {
        Row: {
          amount: number
          asset_id: string
          created_at: string
          event_date: string
          event_month: string | null
          event_type: Database["public"]["Enums"]["asset_event_type"]
          id: string
          notes: string | null
          transaction_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          amount?: number
          asset_id: string
          created_at?: string
          event_date: string
          event_month?: string | null
          event_type: Database["public"]["Enums"]["asset_event_type"]
          id?: string
          notes?: string | null
          transaction_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          asset_id?: string
          created_at?: string
          event_date?: string
          event_month?: string | null
          event_type?: Database["public"]["Enums"]["asset_event_type"]
          id?: string
          notes?: string | null
          transaction_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "asset_events_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asset_events_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      asset_types: {
        Row: {
          created_at: string
          id: string
          name: string
          sort_order: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          sort_order?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          sort_order?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      asset_valuations: {
        Row: {
          asset_id: string
          created_at: string
          id: string
          note: string | null
          observed_on: string
          updated_at: string
          user_id: string
          value: number
        }
        Insert: {
          asset_id: string
          created_at?: string
          id?: string
          note?: string | null
          observed_on: string
          updated_at?: string
          user_id: string
          value: number
        }
        Update: {
          asset_id?: string
          created_at?: string
          id?: string
          note?: string | null
          observed_on?: string
          updated_at?: string
          user_id?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "asset_valuations_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
        ]
      }
      assets: {
        Row: {
          archived: boolean
          created_at: string
          currency: string
          current_value: number
          id: string
          linked_transaction_id: string | null
          name: string
          notes: string | null
          purchase_date: string | null
          purchase_value: number
          residual_value: number
          status: Database["public"]["Enums"]["asset_status"]
          type: string
          updated_at: string
          useful_life_months: number | null
          user_id: string
        }
        Insert: {
          archived?: boolean
          created_at?: string
          currency?: string
          current_value?: number
          id?: string
          linked_transaction_id?: string | null
          name: string
          notes?: string | null
          purchase_date?: string | null
          purchase_value?: number
          residual_value?: number
          status?: Database["public"]["Enums"]["asset_status"]
          type: string
          updated_at?: string
          useful_life_months?: number | null
          user_id: string
        }
        Update: {
          archived?: boolean
          created_at?: string
          currency?: string
          current_value?: number
          id?: string
          linked_transaction_id?: string | null
          name?: string
          notes?: string | null
          purchase_date?: string | null
          purchase_value?: number
          residual_value?: number
          status?: Database["public"]["Enums"]["asset_status"]
          type?: string
          updated_at?: string
          useful_life_months?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "assets_currency_fkey"
            columns: ["currency"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "assets_linked_transaction_id_fkey"
            columns: ["linked_transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      attachments: {
        Row: {
          entity_id: string
          entity_type: string
          file_name: string
          file_path: string
          id: string
          mime_type: string | null
          size_bytes: number | null
          updated_at: string
          uploaded_at: string
          user_id: string
        }
        Insert: {
          entity_id: string
          entity_type: string
          file_name: string
          file_path: string
          id?: string
          mime_type?: string | null
          size_bytes?: number | null
          updated_at?: string
          uploaded_at?: string
          user_id: string
        }
        Update: {
          entity_id?: string
          entity_type?: string
          file_name?: string
          file_path?: string
          id?: string
          mime_type?: string | null
          size_bytes?: number | null
          updated_at?: string
          uploaded_at?: string
          user_id?: string
        }
        Relationships: []
      }
      audit_log: {
        Row: {
          action: string
          created_at: string
          entity_id: string | null
          entity_type: string | null
          id: string
          payload: Json | null
          updated_at: string
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          payload?: Json | null
          updated_at?: string
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          payload?: Json | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      brainstorm_blocks: {
        Row: {
          action_done: boolean
          content: string
          created_at: string
          id: string
          is_action: boolean
          items: string[]
          kind: string
          parent_id: string | null
          plan_item_id: string | null
          pos_x: number
          pos_y: number
          session_id: string
          sort_order: number
          updated_at: string
          user_id: string
        }
        Insert: {
          action_done?: boolean
          content?: string
          created_at?: string
          id?: string
          is_action?: boolean
          items?: string[]
          kind?: string
          parent_id?: string | null
          plan_item_id?: string | null
          pos_x?: number
          pos_y?: number
          session_id: string
          sort_order?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          action_done?: boolean
          content?: string
          created_at?: string
          id?: string
          is_action?: boolean
          items?: string[]
          kind?: string
          parent_id?: string | null
          plan_item_id?: string | null
          pos_x?: number
          pos_y?: number
          session_id?: string
          sort_order?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "brainstorm_blocks_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "brainstorm_blocks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brainstorm_blocks_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "brainstorm_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      brainstorm_folders: {
        Row: {
          color: string | null
          created_at: string
          icon: string | null
          id: string
          is_system: boolean
          name: string
          parent_id: string | null
          sort_order: number
          updated_at: string
          user_id: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          icon?: string | null
          id?: string
          is_system?: boolean
          name: string
          parent_id?: string | null
          sort_order?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          color?: string | null
          created_at?: string
          icon?: string | null
          id?: string
          is_system?: boolean
          name?: string
          parent_id?: string | null
          sort_order?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "brainstorm_folders_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "brainstorm_folders"
            referencedColumns: ["id"]
          },
        ]
      }
      brainstorm_sessions: {
        Row: {
          archived: boolean
          color: string | null
          created_at: string
          folder_id: string | null
          icon: string | null
          id: string
          status: string
          tags: string[]
          title: string
          updated_at: string
          user_id: string
          view_mode: string
        }
        Insert: {
          archived?: boolean
          color?: string | null
          created_at?: string
          folder_id?: string | null
          icon?: string | null
          id?: string
          status?: string
          tags?: string[]
          title?: string
          updated_at?: string
          user_id: string
          view_mode?: string
        }
        Update: {
          archived?: boolean
          color?: string | null
          created_at?: string
          folder_id?: string | null
          icon?: string | null
          id?: string
          status?: string
          tags?: string[]
          title?: string
          updated_at?: string
          user_id?: string
          view_mode?: string
        }
        Relationships: [
          {
            foreignKeyName: "brainstorm_sessions_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "brainstorm_folders"
            referencedColumns: ["id"]
          },
        ]
      }
      budget_categories: {
        Row: {
          archived: boolean
          color: string | null
          created_at: string
          group_id: string | null
          icon: string | null
          id: string
          is_income: boolean
          name: string
          planned_monthly: number
          updated_at: string
          user_id: string
        }
        Insert: {
          archived?: boolean
          color?: string | null
          created_at?: string
          group_id?: string | null
          icon?: string | null
          id?: string
          is_income?: boolean
          name: string
          planned_monthly?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          archived?: boolean
          color?: string | null
          created_at?: string
          group_id?: string | null
          icon?: string | null
          id?: string
          is_income?: boolean
          name?: string
          planned_monthly?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "budget_categories_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "budget_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      budget_groups: {
        Row: {
          color: string | null
          created_at: string
          icon: string | null
          id: string
          name: string
          sort_order: number
          updated_at: string
          user_id: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          icon?: string | null
          id?: string
          name: string
          sort_order?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          color?: string | null
          created_at?: string
          icon?: string | null
          id?: string
          name?: string
          sort_order?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      budget_node_amounts: {
        Row: {
          created_at: string
          id: string
          node_id: string
          notes: string | null
          period_month: string
          planned: number
          revised: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          node_id: string
          notes?: string | null
          period_month: string
          planned?: number
          revised?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          node_id?: string
          notes?: string | null
          period_month?: string
          planned?: number
          revised?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "budget_node_amounts_node_id_fkey"
            columns: ["node_id"]
            isOneToOne: false
            referencedRelation: "budget_nodes"
            referencedColumns: ["id"]
          },
        ]
      }
      budget_nodes: {
        Row: {
          archived: boolean
          color: string | null
          created_at: string
          icon: string | null
          id: string
          is_income: boolean
          kind: string
          name: string
          notes: string | null
          parent_id: string | null
          sort_order: number
          updated_at: string
          user_id: string
        }
        Insert: {
          archived?: boolean
          color?: string | null
          created_at?: string
          icon?: string | null
          id?: string
          is_income?: boolean
          kind?: string
          name: string
          notes?: string | null
          parent_id?: string | null
          sort_order?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          archived?: boolean
          color?: string | null
          created_at?: string
          icon?: string | null
          id?: string
          is_income?: boolean
          kind?: string
          name?: string
          notes?: string | null
          parent_id?: string | null
          sort_order?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "budget_nodes_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "budget_nodes"
            referencedColumns: ["id"]
          },
        ]
      }
      budget_periods: {
        Row: {
          category_id: string
          created_at: string
          id: string
          notes: string | null
          period_month: string
          planned: number
          revised: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          category_id: string
          created_at?: string
          id?: string
          notes?: string | null
          period_month: string
          planned?: number
          revised?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          category_id?: string
          created_at?: string
          id?: string
          notes?: string | null
          period_month?: string
          planned?: number
          revised?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "budget_periods_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "budget_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_conversations: {
        Row: {
          archived: boolean
          created_at: string
          id: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          archived?: boolean
          created_at?: string
          id?: string
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          archived?: boolean
          created_at?: string
          id?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      chat_messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          id: string
          role: string
          updated_at: string
          user_id: string
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string
          id?: string
          role: string
          updated_at?: string
          user_id: string
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          role?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "chat_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      coach_plan_items: {
        Row: {
          category: string | null
          created_at: string
          detail: string | null
          done_at: string | null
          due_date: string | null
          effort: string | null
          id: string
          impact: number
          module_to: string | null
          order_index: number
          plan_id: string
          rec_key: string | null
          status: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          detail?: string | null
          done_at?: string | null
          due_date?: string | null
          effort?: string | null
          id?: string
          impact?: number
          module_to?: string | null
          order_index?: number
          plan_id: string
          rec_key?: string | null
          status?: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          category?: string | null
          created_at?: string
          detail?: string | null
          done_at?: string | null
          due_date?: string | null
          effort?: string | null
          id?: string
          impact?: number
          module_to?: string | null
          order_index?: number
          plan_id?: string
          rec_key?: string | null
          status?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "coach_plan_items_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "coach_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      coach_plans: {
        Row: {
          archived: boolean
          created_at: string
          focus: string | null
          id: string
          period_month: string
          source: string
          status: string
          summary: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          archived?: boolean
          created_at?: string
          focus?: string | null
          id?: string
          period_month: string
          source?: string
          status?: string
          summary?: string | null
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          archived?: boolean
          created_at?: string
          focus?: string | null
          id?: string
          period_month?: string
          source?: string
          status?: string
          summary?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      counterparties: {
        Row: {
          archived: boolean
          created_at: string
          group_name: string | null
          id: string
          kind: string | null
          name: string
          notes: string | null
          service_name: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          archived?: boolean
          created_at?: string
          group_name?: string | null
          id?: string
          kind?: string | null
          name: string
          notes?: string | null
          service_name?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          archived?: boolean
          created_at?: string
          group_name?: string | null
          id?: string
          kind?: string | null
          name?: string
          notes?: string | null
          service_name?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      currencies: {
        Row: {
          code: string
          name: string
          symbol: string | null
          updated_at: string
        }
        Insert: {
          code: string
          name: string
          symbol?: string | null
          updated_at?: string
        }
        Update: {
          code?: string
          name?: string
          symbol?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      debts: {
        Row: {
          archived: boolean
          created_at: string
          creditor: string
          currency: string
          description: string | null
          due_date: string | null
          id: string
          linked_transaction_id: string | null
          notes: string | null
          original_amount: number
          outstanding: number
          project_id: string | null
          status: Database["public"]["Enums"]["debt_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          archived?: boolean
          created_at?: string
          creditor: string
          currency?: string
          description?: string | null
          due_date?: string | null
          id?: string
          linked_transaction_id?: string | null
          notes?: string | null
          original_amount: number
          outstanding: number
          project_id?: string | null
          status?: Database["public"]["Enums"]["debt_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          archived?: boolean
          created_at?: string
          creditor?: string
          currency?: string
          description?: string | null
          due_date?: string | null
          id?: string
          linked_transaction_id?: string | null
          notes?: string | null
          original_amount?: number
          outstanding?: number
          project_id?: string | null
          status?: Database["public"]["Enums"]["debt_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "debts_currency_fkey"
            columns: ["currency"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "debts_linked_transaction_id_fkey"
            columns: ["linked_transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "debts_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      document_events: {
        Row: {
          author: string | null
          created_at: string
          description: string | null
          document_id: string
          event_type: string
          id: string
          location: string | null
          notes: string | null
          occurred_at: string
          title: string
          updated_at: string
          user_id: string
          version: string | null
        }
        Insert: {
          author?: string | null
          created_at?: string
          description?: string | null
          document_id: string
          event_type?: string
          id?: string
          location?: string | null
          notes?: string | null
          occurred_at?: string
          title: string
          updated_at?: string
          user_id?: string
          version?: string | null
        }
        Update: {
          author?: string | null
          created_at?: string
          description?: string | null
          document_id?: string
          event_type?: string
          id?: string
          location?: string | null
          notes?: string | null
          occurred_at?: string
          title?: string
          updated_at?: string
          user_id?: string
          version?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "document_events_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          archived: boolean
          category: string
          confidentiality: string
          created_at: string
          current_version: string | null
          description: string | null
          document_date: string | null
          due_date: string | null
          file_type: string | null
          folder: string | null
          id: string
          name: string
          notes: string | null
          owner: string | null
          path_or_link: string | null
          reference: string | null
          status: string
          tags: string[]
          updated_at: string
          user_id: string
        }
        Insert: {
          archived?: boolean
          category?: string
          confidentiality?: string
          created_at?: string
          current_version?: string | null
          description?: string | null
          document_date?: string | null
          due_date?: string | null
          file_type?: string | null
          folder?: string | null
          id?: string
          name: string
          notes?: string | null
          owner?: string | null
          path_or_link?: string | null
          reference?: string | null
          status?: string
          tags?: string[]
          updated_at?: string
          user_id?: string
        }
        Update: {
          archived?: boolean
          category?: string
          confidentiality?: string
          created_at?: string
          current_version?: string | null
          description?: string | null
          document_date?: string | null
          due_date?: string | null
          file_type?: string | null
          folder?: string | null
          id?: string
          name?: string
          notes?: string | null
          owner?: string | null
          path_or_link?: string | null
          reference?: string | null
          status?: string
          tags?: string[]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      exchange_rates: {
        Row: {
          created_at: string
          from_code: string
          id: string
          notes: string | null
          rate: number
          rate_date: string
          to_code: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          from_code: string
          id?: string
          notes?: string | null
          rate: number
          rate_date?: string
          to_code: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          from_code?: string
          id?: string
          notes?: string | null
          rate?: number
          rate_date?: string
          to_code?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "exchange_rates_from_code_fkey"
            columns: ["from_code"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "exchange_rates_to_code_fkey"
            columns: ["to_code"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
        ]
      }
      financial_goals: {
        Row: {
          archived: boolean
          budget_node_id: string | null
          created_at: string
          currency: string
          current_amount: number
          description: string | null
          goal_type: string | null
          id: string
          linked_transaction_id: string | null
          name: string
          period_end: string | null
          period_scope: string | null
          period_start: string | null
          status: Database["public"]["Enums"]["goal_status"]
          target_amount: number
          target_date: string | null
          updated_at: string
          user_id: string
          watch_node_ids: string[] | null
        }
        Insert: {
          archived?: boolean
          budget_node_id?: string | null
          created_at?: string
          currency?: string
          current_amount?: number
          description?: string | null
          goal_type?: string | null
          id?: string
          linked_transaction_id?: string | null
          name: string
          period_end?: string | null
          period_scope?: string | null
          period_start?: string | null
          status?: Database["public"]["Enums"]["goal_status"]
          target_amount: number
          target_date?: string | null
          updated_at?: string
          user_id: string
          watch_node_ids?: string[] | null
        }
        Update: {
          archived?: boolean
          budget_node_id?: string | null
          created_at?: string
          currency?: string
          current_amount?: number
          description?: string | null
          goal_type?: string | null
          id?: string
          linked_transaction_id?: string | null
          name?: string
          period_end?: string | null
          period_scope?: string | null
          period_start?: string | null
          status?: Database["public"]["Enums"]["goal_status"]
          target_amount?: number
          target_date?: string | null
          updated_at?: string
          user_id?: string
          watch_node_ids?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "financial_goals_budget_node_id_fkey"
            columns: ["budget_node_id"]
            isOneToOne: false
            referencedRelation: "budget_nodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_goals_currency_fkey"
            columns: ["currency"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "financial_goals_linked_transaction_id_fkey"
            columns: ["linked_transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      fridge_items: {
        Row: {
          added_on: string
          archived: boolean
          created_at: string
          expires_on: string | null
          id: string
          name: string
          notes: string | null
          quantity: number | null
          unit: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          added_on?: string
          archived?: boolean
          created_at?: string
          expires_on?: string | null
          id?: string
          name: string
          notes?: string | null
          quantity?: number | null
          unit?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          added_on?: string
          archived?: boolean
          created_at?: string
          expires_on?: string | null
          id?: string
          name?: string
          notes?: string | null
          quantity?: number | null
          unit?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      income_sources: {
        Row: {
          active: boolean
          amount: number
          created_at: string
          currency: string
          cycle: string
          id: string
          kind: string
          name: string
          next_date: string | null
          notes: string | null
          recurring: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          active?: boolean
          amount?: number
          created_at?: string
          currency?: string
          cycle?: string
          id?: string
          kind?: string
          name: string
          next_date?: string | null
          notes?: string | null
          recurring?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          active?: boolean
          amount?: number
          created_at?: string
          currency?: string
          cycle?: string
          id?: string
          kind?: string
          name?: string
          next_date?: string | null
          notes?: string | null
          recurring?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "income_sources_currency_fkey"
            columns: ["currency"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
        ]
      }
      invoices_to_issue: {
        Row: {
          amount: number
          client: string
          created_at: string
          currency: string
          description: string | null
          due_date: string | null
          id: string
          issued_on: string | null
          notes: string | null
          paid_amount: number
          paid_on: string | null
          status: Database["public"]["Enums"]["invoice_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          amount: number
          client: string
          created_at?: string
          currency?: string
          description?: string | null
          due_date?: string | null
          id?: string
          issued_on?: string | null
          notes?: string | null
          paid_amount?: number
          paid_on?: string | null
          status?: Database["public"]["Enums"]["invoice_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          client?: string
          created_at?: string
          currency?: string
          description?: string | null
          due_date?: string | null
          id?: string
          issued_on?: string | null
          notes?: string | null
          paid_amount?: number
          paid_on?: string | null
          status?: Database["public"]["Enums"]["invoice_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_to_issue_currency_fkey"
            columns: ["currency"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
        ]
      }
      life_domains: {
        Row: {
          archived: boolean
          color: string
          created_at: string
          id: string
          keywords: string[]
          label: string
          match_project_ids: string[]
          match_tag_ids: string[]
          match_type_ids: string[]
          notes: string | null
          sort_order: number
          updated_at: string
          user_id: string
          weight: number
        }
        Insert: {
          archived?: boolean
          color?: string
          created_at?: string
          id?: string
          keywords?: string[]
          label: string
          match_project_ids?: string[]
          match_tag_ids?: string[]
          match_type_ids?: string[]
          notes?: string | null
          sort_order?: number
          updated_at?: string
          user_id: string
          weight?: number
        }
        Update: {
          archived?: boolean
          color?: string
          created_at?: string
          id?: string
          keywords?: string[]
          label?: string
          match_project_ids?: string[]
          match_tag_ids?: string[]
          match_type_ids?: string[]
          notes?: string | null
          sort_order?: number
          updated_at?: string
          user_id?: string
          weight?: number
        }
        Relationships: []
      }
      loan_amortizations: {
        Row: {
          balance_after: number
          id: string
          interest_amount: number
          loan_id: string
          paid: boolean
          payment_date: string
          period_no: number
          principal_amount: number
          updated_at: string
          user_id: string
        }
        Insert: {
          balance_after: number
          id?: string
          interest_amount: number
          loan_id: string
          paid?: boolean
          payment_date: string
          period_no: number
          principal_amount: number
          updated_at?: string
          user_id: string
        }
        Update: {
          balance_after?: number
          id?: string
          interest_amount?: number
          loan_id?: string
          paid?: boolean
          payment_date?: string
          period_no?: number
          principal_amount?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "loan_amortizations_loan_id_fkey"
            columns: ["loan_id"]
            isOneToOne: false
            referencedRelation: "loans"
            referencedColumns: ["id"]
          },
        ]
      }
      loans: {
        Row: {
          created_at: string
          currency: string
          duration_months: number
          id: string
          interest_paid: number
          interest_rate: number
          lender: string
          monthly_payment: number
          notes: string | null
          outstanding: number
          principal: number
          start_date: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          currency?: string
          duration_months: number
          id?: string
          interest_paid?: number
          interest_rate?: number
          lender: string
          monthly_payment?: number
          notes?: string | null
          outstanding: number
          principal: number
          start_date: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          currency?: string
          duration_months?: number
          id?: string
          interest_paid?: number
          interest_rate?: number
          lender?: string
          monthly_payment?: number
          notes?: string | null
          outstanding?: number
          principal?: number
          start_date?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "loans_currency_fkey"
            columns: ["currency"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
        ]
      }
      meal_plan_entries: {
        Row: {
          created_at: string
          day_of_week: number
          fridge_item_id: string | null
          id: string
          label: string
          slot: string
          sort_order: number
          updated_at: string
          user_id: string
          week_start: string
        }
        Insert: {
          created_at?: string
          day_of_week: number
          fridge_item_id?: string | null
          id?: string
          label?: string
          slot?: string
          sort_order?: number
          updated_at?: string
          user_id: string
          week_start: string
        }
        Update: {
          created_at?: string
          day_of_week?: number
          fridge_item_id?: string | null
          id?: string
          label?: string
          slot?: string
          sort_order?: number
          updated_at?: string
          user_id?: string
          week_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "meal_plan_entries_fridge_item_id_fkey"
            columns: ["fridge_item_id"]
            isOneToOne: false
            referencedRelation: "fridge_items"
            referencedColumns: ["id"]
          },
        ]
      }
      monthly_snapshots: {
        Row: {
          cash_position: number
          created_at: string
          id: string
          monthly_expense: number
          monthly_income: number
          net_worth: number
          snapshot_month: string
          total_assets: number
          total_debt: number
          total_investments: number
          total_receivables: number
          updated_at: string
          user_id: string
        }
        Insert: {
          cash_position?: number
          created_at?: string
          id?: string
          monthly_expense?: number
          monthly_income?: number
          net_worth?: number
          snapshot_month: string
          total_assets?: number
          total_debt?: number
          total_investments?: number
          total_receivables?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          cash_position?: number
          created_at?: string
          id?: string
          monthly_expense?: number
          monthly_income?: number
          net_worth?: number
          snapshot_month?: string
          total_assets?: number
          total_debt?: number
          total_investments?: number
          total_receivables?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          dedupe_key: string
          dismissed_at: string | null
          due_date: string | null
          id: string
          kind: string
          link_to: string | null
          read_at: string | null
          severity: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          dedupe_key: string
          dismissed_at?: string | null
          due_date?: string | null
          id?: string
          kind?: string
          link_to?: string | null
          read_at?: string | null
          severity?: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          dedupe_key?: string
          dismissed_at?: string | null
          due_date?: string | null
          id?: string
          kind?: string
          link_to?: string | null
          read_at?: string | null
          severity?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      periodic_reports: {
        Row: {
          commentary: string | null
          created_at: string
          id: string
          kind: string
          label: string | null
          metrics: Json
          period_end: string
          period_start: string
          updated_at: string
          user_id: string
        }
        Insert: {
          commentary?: string | null
          created_at?: string
          id?: string
          kind?: string
          label?: string | null
          metrics?: Json
          period_end: string
          period_start: string
          updated_at?: string
          user_id: string
        }
        Update: {
          commentary?: string | null
          created_at?: string
          id?: string
          kind?: string
          label?: string | null
          metrics?: Json
          period_end?: string
          period_start?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      plan_item_tags: {
        Row: {
          created_at: string
          id: string
          item_id: string
          tag_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          item_id: string
          tag_id: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          id?: string
          item_id?: string
          tag_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_item_tags_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "plan_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_item_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "plan_tags"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_items: {
        Row: {
          all_day: boolean
          completed_at: string | null
          counterparty_id: string | null
          created_at: string
          duration_minutes: number | null
          end_on: string | null
          end_time: string | null
          id: string
          important: boolean
          location: string | null
          no_fixed_time: boolean
          notes: string | null
          person_label: string | null
          priority: string
          project_id: string | null
          recurrence: string
          recurrence_interval: number
          recurrence_month_days: number[] | null
          recurrence_until: string | null
          recurrence_weekdays: number[] | null
          reminder_minutes: number | null
          scheduled_on: string
          sort_order: number
          start_time: string | null
          status: string
          times_per_day: number
          title: string
          type_id: string | null
          updated_at: string
          urgent: boolean
          user_id: string
        }
        Insert: {
          all_day?: boolean
          completed_at?: string | null
          counterparty_id?: string | null
          created_at?: string
          duration_minutes?: number | null
          end_on?: string | null
          end_time?: string | null
          id?: string
          important?: boolean
          location?: string | null
          no_fixed_time?: boolean
          notes?: string | null
          person_label?: string | null
          priority?: string
          project_id?: string | null
          recurrence?: string
          recurrence_interval?: number
          recurrence_month_days?: number[] | null
          recurrence_until?: string | null
          recurrence_weekdays?: number[] | null
          reminder_minutes?: number | null
          scheduled_on?: string
          sort_order?: number
          start_time?: string | null
          status?: string
          times_per_day?: number
          title: string
          type_id?: string | null
          updated_at?: string
          urgent?: boolean
          user_id?: string
        }
        Update: {
          all_day?: boolean
          completed_at?: string | null
          counterparty_id?: string | null
          created_at?: string
          duration_minutes?: number | null
          end_on?: string | null
          end_time?: string | null
          id?: string
          important?: boolean
          location?: string | null
          no_fixed_time?: boolean
          notes?: string | null
          person_label?: string | null
          priority?: string
          project_id?: string | null
          recurrence?: string
          recurrence_interval?: number
          recurrence_month_days?: number[] | null
          recurrence_until?: string | null
          recurrence_weekdays?: number[] | null
          reminder_minutes?: number | null
          scheduled_on?: string
          sort_order?: number
          start_time?: string | null
          status?: string
          times_per_day?: number
          title?: string
          type_id?: string | null
          updated_at?: string
          urgent?: boolean
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_items_counterparty_id_fkey"
            columns: ["counterparty_id"]
            isOneToOne: false
            referencedRelation: "counterparties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_items_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "plan_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_items_type_id_fkey"
            columns: ["type_id"]
            isOneToOne: false
            referencedRelation: "plan_types"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_projects: {
        Row: {
          archived: boolean
          color: string
          created_at: string
          description: string | null
          due_date: string | null
          id: string
          name: string
          priority: string
          start_date: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          archived?: boolean
          color?: string
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          name: string
          priority?: string
          start_date?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          archived?: boolean
          color?: string
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          name?: string
          priority?: string
          start_date?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      plan_tags: {
        Row: {
          color: string
          created_at: string
          id: string
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          color?: string
          created_at?: string
          id?: string
          name: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      plan_types: {
        Row: {
          archived: boolean
          color: string
          created_at: string
          icon: string | null
          id: string
          in_eisenhower: boolean
          name: string
          sort_order: number
          updated_at: string
          user_id: string
        }
        Insert: {
          archived?: boolean
          color?: string
          created_at?: string
          icon?: string | null
          id?: string
          in_eisenhower?: boolean
          name: string
          sort_order?: number
          updated_at?: string
          user_id?: string
        }
        Update: {
          archived?: boolean
          color?: string
          created_at?: string
          icon?: string | null
          id?: string
          in_eisenhower?: boolean
          name?: string
          sort_order?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      product_prices: {
        Row: {
          created_at: string
          currency: string
          id: string
          notes: string | null
          observed_on: string
          product_id: string
          source_item_id: string | null
          supplier: string | null
          unit_price: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          currency?: string
          id?: string
          notes?: string | null
          observed_on?: string
          product_id: string
          source_item_id?: string | null
          supplier?: string | null
          unit_price: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          currency?: string
          id?: string
          notes?: string | null
          observed_on?: string
          product_id?: string
          source_item_id?: string | null
          supplier?: string | null
          unit_price?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_prices_currency_fkey"
            columns: ["currency"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "product_prices_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_prices_source_item_id_fkey"
            columns: ["source_item_id"]
            isOneToOne: false
            referencedRelation: "shopping_list_items"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          archived: boolean
          category: string | null
          created_at: string
          id: string
          name: string
          notes: string | null
          unit: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          archived?: boolean
          category?: string | null
          created_at?: string
          id?: string
          name: string
          notes?: string | null
          unit?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          archived?: boolean
          category?: string | null
          created_at?: string
          id?: string
          name?: string
          notes?: string | null
          unit?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          base_currency: string
          created_at: string
          date_format: string
          full_name: string | null
          id: string
          locale: string
          shopping_default_node_id: string | null
          shopping_default_tag_ids: string[]
          shopping_default_wallet_id: string | null
          updated_at: string
        }
        Insert: {
          base_currency?: string
          created_at?: string
          date_format?: string
          full_name?: string | null
          id: string
          locale?: string
          shopping_default_node_id?: string | null
          shopping_default_tag_ids?: string[]
          shopping_default_wallet_id?: string | null
          updated_at?: string
        }
        Update: {
          base_currency?: string
          created_at?: string
          date_format?: string
          full_name?: string | null
          id?: string
          locale?: string
          shopping_default_node_id?: string | null
          shopping_default_tag_ids?: string[]
          shopping_default_wallet_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_shopping_default_node_id_fkey"
            columns: ["shopping_default_node_id"]
            isOneToOne: false
            referencedRelation: "budget_nodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_shopping_default_wallet_id_fkey"
            columns: ["shopping_default_wallet_id"]
            isOneToOne: false
            referencedRelation: "wallets"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          archived: boolean
          budget_node_id: string | null
          closed_at: string | null
          color: string | null
          created_at: string
          currency: string
          current_amount: number
          description: string | null
          envelope_balance: number
          funding_wallet_id: string | null
          id: string
          linked_transaction_id: string | null
          name: string
          resulted_asset_id: string | null
          status: Database["public"]["Enums"]["project_status"]
          target_amount: number
          target_date: string | null
          total_spent: number
          updated_at: string
          user_id: string
        }
        Insert: {
          archived?: boolean
          budget_node_id?: string | null
          closed_at?: string | null
          color?: string | null
          created_at?: string
          currency?: string
          current_amount?: number
          description?: string | null
          envelope_balance?: number
          funding_wallet_id?: string | null
          id?: string
          linked_transaction_id?: string | null
          name: string
          resulted_asset_id?: string | null
          status?: Database["public"]["Enums"]["project_status"]
          target_amount?: number
          target_date?: string | null
          total_spent?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          archived?: boolean
          budget_node_id?: string | null
          closed_at?: string | null
          color?: string | null
          created_at?: string
          currency?: string
          current_amount?: number
          description?: string | null
          envelope_balance?: number
          funding_wallet_id?: string | null
          id?: string
          linked_transaction_id?: string | null
          name?: string
          resulted_asset_id?: string | null
          status?: Database["public"]["Enums"]["project_status"]
          target_amount?: number
          target_date?: string | null
          total_spent?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_budget_node_id_fkey"
            columns: ["budget_node_id"]
            isOneToOne: false
            referencedRelation: "budget_nodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_currency_fkey"
            columns: ["currency"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "projects_funding_wallet_id_fkey"
            columns: ["funding_wallet_id"]
            isOneToOne: false
            referencedRelation: "wallets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_linked_transaction_id_fkey"
            columns: ["linked_transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_resulted_asset_id_fkey"
            columns: ["resulted_asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
        ]
      }
      provisions: {
        Row: {
          actual_amount: number | null
          amount: number
          booking_tx_id: string | null
          budget_node_id: string | null
          category: string | null
          counterparty_id: string | null
          created_at: string
          currency: string
          description: string | null
          direction: string
          due_date: string | null
          exchange_rate: number
          id: string
          name: string
          notes: string | null
          payment_tx_id: string | null
          period_month: string | null
          reversal_tx_id: string | null
          settled_at: string | null
          status: Database["public"]["Enums"]["provision_status"]
          subscription_id: string | null
          updated_at: string
          user_id: string
          wallet_id: string | null
        }
        Insert: {
          actual_amount?: number | null
          amount: number
          booking_tx_id?: string | null
          budget_node_id?: string | null
          category?: string | null
          counterparty_id?: string | null
          created_at?: string
          currency?: string
          description?: string | null
          direction?: string
          due_date?: string | null
          exchange_rate?: number
          id?: string
          name: string
          notes?: string | null
          payment_tx_id?: string | null
          period_month?: string | null
          reversal_tx_id?: string | null
          settled_at?: string | null
          status?: Database["public"]["Enums"]["provision_status"]
          subscription_id?: string | null
          updated_at?: string
          user_id: string
          wallet_id?: string | null
        }
        Update: {
          actual_amount?: number | null
          amount?: number
          booking_tx_id?: string | null
          budget_node_id?: string | null
          category?: string | null
          counterparty_id?: string | null
          created_at?: string
          currency?: string
          description?: string | null
          direction?: string
          due_date?: string | null
          exchange_rate?: number
          id?: string
          name?: string
          notes?: string | null
          payment_tx_id?: string | null
          period_month?: string | null
          reversal_tx_id?: string | null
          settled_at?: string | null
          status?: Database["public"]["Enums"]["provision_status"]
          subscription_id?: string | null
          updated_at?: string
          user_id?: string
          wallet_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "provisions_booking_tx_id_fkey"
            columns: ["booking_tx_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "provisions_budget_node_id_fkey"
            columns: ["budget_node_id"]
            isOneToOne: false
            referencedRelation: "budget_nodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "provisions_counterparty_id_fkey"
            columns: ["counterparty_id"]
            isOneToOne: false
            referencedRelation: "counterparties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "provisions_currency_fkey"
            columns: ["currency"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "provisions_payment_tx_id_fkey"
            columns: ["payment_tx_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "provisions_reversal_tx_id_fkey"
            columns: ["reversal_tx_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "provisions_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "provisions_wallet_id_fkey"
            columns: ["wallet_id"]
            isOneToOne: false
            referencedRelation: "wallets"
            referencedColumns: ["id"]
          },
        ]
      }
      receivables: {
        Row: {
          archived: boolean
          created_at: string
          currency: string
          debtor: string
          description: string | null
          due_date: string | null
          id: string
          linked_transaction_id: string | null
          notes: string | null
          original_amount: number
          outstanding: number
          status: Database["public"]["Enums"]["debt_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          archived?: boolean
          created_at?: string
          currency?: string
          debtor: string
          description?: string | null
          due_date?: string | null
          id?: string
          linked_transaction_id?: string | null
          notes?: string | null
          original_amount: number
          outstanding: number
          status?: Database["public"]["Enums"]["debt_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          archived?: boolean
          created_at?: string
          currency?: string
          debtor?: string
          description?: string | null
          due_date?: string | null
          id?: string
          linked_transaction_id?: string | null
          notes?: string | null
          original_amount?: number
          outstanding?: number
          status?: Database["public"]["Enums"]["debt_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "receivables_currency_fkey"
            columns: ["currency"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "receivables_linked_transaction_id_fkey"
            columns: ["linked_transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      salary_records: {
        Row: {
          benefits: number
          bonus: number
          created_at: string
          currency: string
          employer: string | null
          gross_amount: number
          id: string
          net_amount: number
          notes: string | null
          period_month: string
          updated_at: string
          user_id: string
        }
        Insert: {
          benefits?: number
          bonus?: number
          created_at?: string
          currency?: string
          employer?: string | null
          gross_amount?: number
          id?: string
          net_amount?: number
          notes?: string | null
          period_month: string
          updated_at?: string
          user_id: string
        }
        Update: {
          benefits?: number
          bonus?: number
          created_at?: string
          currency?: string
          employer?: string | null
          gross_amount?: number
          id?: string
          net_amount?: number
          notes?: string | null
          period_month?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "salary_records_currency_fkey"
            columns: ["currency"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
        ]
      }
      scenarios: {
        Row: {
          assumptions: Json
          created_at: string
          id: string
          name: string
          notes: string | null
          type: Database["public"]["Enums"]["scenario_type"]
          updated_at: string
          user_id: string
        }
        Insert: {
          assumptions?: Json
          created_at?: string
          id?: string
          name: string
          notes?: string | null
          type?: Database["public"]["Enums"]["scenario_type"]
          updated_at?: string
          user_id: string
        }
        Update: {
          assumptions?: Json
          created_at?: string
          id?: string
          name?: string
          notes?: string | null
          type?: Database["public"]["Enums"]["scenario_type"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      shopping_list_items: {
        Row: {
          checked: boolean
          created_at: string
          id: string
          list_id: string
          product_id: string | null
          product_name: string
          quantity: number
          total: number
          unit: string | null
          unit_price: number
          updated_at: string
          user_id: string
        }
        Insert: {
          checked?: boolean
          created_at?: string
          id?: string
          list_id: string
          product_id?: string | null
          product_name: string
          quantity?: number
          total?: number
          unit?: string | null
          unit_price?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          checked?: boolean
          created_at?: string
          id?: string
          list_id?: string
          product_id?: string | null
          product_name?: string
          quantity?: number
          total?: number
          unit?: string | null
          unit_price?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shopping_list_items_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "shopping_lists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shopping_list_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      shopping_lists: {
        Row: {
          archived: boolean
          budget_node_id: string | null
          created_at: string
          currency: string
          id: string
          notes: string | null
          occurred_on: string
          store: string | null
          tag_ids: string[]
          title: string | null
          total: number
          transaction_id: string | null
          updated_at: string
          user_id: string
          wallet_id: string | null
        }
        Insert: {
          archived?: boolean
          budget_node_id?: string | null
          created_at?: string
          currency?: string
          id?: string
          notes?: string | null
          occurred_on?: string
          store?: string | null
          tag_ids?: string[]
          title?: string | null
          total?: number
          transaction_id?: string | null
          updated_at?: string
          user_id: string
          wallet_id?: string | null
        }
        Update: {
          archived?: boolean
          budget_node_id?: string | null
          created_at?: string
          currency?: string
          id?: string
          notes?: string | null
          occurred_on?: string
          store?: string | null
          tag_ids?: string[]
          title?: string | null
          total?: number
          transaction_id?: string | null
          updated_at?: string
          user_id?: string
          wallet_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shopping_lists_budget_node_id_fkey"
            columns: ["budget_node_id"]
            isOneToOne: false
            referencedRelation: "budget_nodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shopping_lists_currency_fkey"
            columns: ["currency"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "shopping_lists_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shopping_lists_wallet_id_fkey"
            columns: ["wallet_id"]
            isOneToOne: false
            referencedRelation: "wallets"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          active: boolean
          amount: number
          billing_cycle: string
          budget_node_id: string | null
          category: string | null
          counterparty_id: string | null
          created_at: string
          currency: string
          description: string | null
          direction: string
          id: string
          last_provisioned_month: string | null
          name: string
          next_billing_date: string | null
          notes: string | null
          updated_at: string
          user_id: string
          wallet_id: string | null
        }
        Insert: {
          active?: boolean
          amount: number
          billing_cycle?: string
          budget_node_id?: string | null
          category?: string | null
          counterparty_id?: string | null
          created_at?: string
          currency?: string
          description?: string | null
          direction?: string
          id?: string
          last_provisioned_month?: string | null
          name: string
          next_billing_date?: string | null
          notes?: string | null
          updated_at?: string
          user_id: string
          wallet_id?: string | null
        }
        Update: {
          active?: boolean
          amount?: number
          billing_cycle?: string
          budget_node_id?: string | null
          category?: string | null
          counterparty_id?: string | null
          created_at?: string
          currency?: string
          description?: string | null
          direction?: string
          id?: string
          last_provisioned_month?: string | null
          name?: string
          next_billing_date?: string | null
          notes?: string | null
          updated_at?: string
          user_id?: string
          wallet_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_budget_node_id_fkey"
            columns: ["budget_node_id"]
            isOneToOne: false
            referencedRelation: "budget_nodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_counterparty_id_fkey"
            columns: ["counterparty_id"]
            isOneToOne: false
            referencedRelation: "counterparties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_currency_fkey"
            columns: ["currency"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "subscriptions_wallet_id_fkey"
            columns: ["wallet_id"]
            isOneToOne: false
            referencedRelation: "wallets"
            referencedColumns: ["id"]
          },
        ]
      }
      transaction_tags: {
        Row: {
          tag_id: string
          transaction_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          tag_id: string
          transaction_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          tag_id?: string
          transaction_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transaction_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "analytical_tags"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_tags_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      transactions: {
        Row: {
          amount: number
          archived: boolean
          asset_id: string | null
          attachment_url: string | null
          base_amount: number
          budget_category_id: string | null
          budget_node_id: string | null
          counterparty_id: string | null
          counterparty_label: string | null
          created_at: string
          currency: string
          debt_id: string | null
          description: string
          exchange_rate: number
          fx_exclude: boolean
          id: string
          notes: string | null
          occurred_on: string
          project_id: string | null
          receivable_id: string | null
          source_id: string | null
          source_kind: string | null
          to_wallet_id: string | null
          type: Database["public"]["Enums"]["txn_type"]
          updated_at: string
          user_id: string
          wallet_id: string | null
        }
        Insert: {
          amount: number
          archived?: boolean
          asset_id?: string | null
          attachment_url?: string | null
          base_amount: number
          budget_category_id?: string | null
          budget_node_id?: string | null
          counterparty_id?: string | null
          counterparty_label?: string | null
          created_at?: string
          currency?: string
          debt_id?: string | null
          description: string
          exchange_rate?: number
          fx_exclude?: boolean
          id?: string
          notes?: string | null
          occurred_on?: string
          project_id?: string | null
          receivable_id?: string | null
          source_id?: string | null
          source_kind?: string | null
          to_wallet_id?: string | null
          type: Database["public"]["Enums"]["txn_type"]
          updated_at?: string
          user_id: string
          wallet_id?: string | null
        }
        Update: {
          amount?: number
          archived?: boolean
          asset_id?: string | null
          attachment_url?: string | null
          base_amount?: number
          budget_category_id?: string | null
          budget_node_id?: string | null
          counterparty_id?: string | null
          counterparty_label?: string | null
          created_at?: string
          currency?: string
          debt_id?: string | null
          description?: string
          exchange_rate?: number
          fx_exclude?: boolean
          id?: string
          notes?: string | null
          occurred_on?: string
          project_id?: string | null
          receivable_id?: string | null
          source_id?: string | null
          source_kind?: string | null
          to_wallet_id?: string | null
          type?: Database["public"]["Enums"]["txn_type"]
          updated_at?: string
          user_id?: string
          wallet_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "transactions_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_budget_category_id_fkey"
            columns: ["budget_category_id"]
            isOneToOne: false
            referencedRelation: "budget_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_budget_node_id_fkey"
            columns: ["budget_node_id"]
            isOneToOne: false
            referencedRelation: "budget_nodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_counterparty_id_fkey"
            columns: ["counterparty_id"]
            isOneToOne: false
            referencedRelation: "counterparties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_currency_fkey"
            columns: ["currency"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "transactions_debt_id_fkey"
            columns: ["debt_id"]
            isOneToOne: false
            referencedRelation: "debts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_receivable_id_fkey"
            columns: ["receivable_id"]
            isOneToOne: false
            referencedRelation: "receivables"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_to_wallet_id_fkey"
            columns: ["to_wallet_id"]
            isOneToOne: false
            referencedRelation: "wallets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_wallet_id_fkey"
            columns: ["wallet_id"]
            isOneToOne: false
            referencedRelation: "wallets"
            referencedColumns: ["id"]
          },
        ]
      }
      utility_readings: {
        Row: {
          consumption: number | null
          created_at: string
          currency: string
          current_reading: number
          id: string
          invoice_amount: number
          notes: string | null
          period_end: string
          period_start: string
          previous_reading: number
          type: Database["public"]["Enums"]["utility_type"]
          updated_at: string
          user_id: string
        }
        Insert: {
          consumption?: number | null
          created_at?: string
          currency?: string
          current_reading?: number
          id?: string
          invoice_amount?: number
          notes?: string | null
          period_end: string
          period_start: string
          previous_reading?: number
          type: Database["public"]["Enums"]["utility_type"]
          updated_at?: string
          user_id: string
        }
        Update: {
          consumption?: number | null
          created_at?: string
          currency?: string
          current_reading?: number
          id?: string
          invoice_amount?: number
          notes?: string | null
          period_end?: string
          period_start?: string
          previous_reading?: number
          type?: Database["public"]["Enums"]["utility_type"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "utility_readings_currency_fkey"
            columns: ["currency"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
        ]
      }
      wallets: {
        Row: {
          color: string | null
          created_at: string
          currency: string
          current_balance: number
          icon: string | null
          id: string
          name: string
          notes: string | null
          opening_balance: number
          status: Database["public"]["Enums"]["wallet_status"]
          type: Database["public"]["Enums"]["wallet_type"]
          updated_at: string
          user_id: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          currency?: string
          current_balance?: number
          icon?: string | null
          id?: string
          name: string
          notes?: string | null
          opening_balance?: number
          status?: Database["public"]["Enums"]["wallet_status"]
          type?: Database["public"]["Enums"]["wallet_type"]
          updated_at?: string
          user_id: string
        }
        Update: {
          color?: string | null
          created_at?: string
          currency?: string
          current_balance?: number
          icon?: string | null
          id?: string
          name?: string
          notes?: string | null
          opening_balance?: number
          status?: Database["public"]["Enums"]["wallet_status"]
          type?: Database["public"]["Enums"]["wallet_type"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wallets_currency_fkey"
            columns: ["currency"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
        ]
      }
      weekly_reviews: {
        Row: {
          alignment_score: number | null
          completed_at: string | null
          created_at: string
          execution_score: number | null
          finance_note: string | null
          finance_score: number | null
          id: string
          lessons: string | null
          life_score: number | null
          misses: string | null
          next_focus: string | null
          updated_at: string
          user_id: string
          week_start: string
          wins: string | null
        }
        Insert: {
          alignment_score?: number | null
          completed_at?: string | null
          created_at?: string
          execution_score?: number | null
          finance_note?: string | null
          finance_score?: number | null
          id?: string
          lessons?: string | null
          life_score?: number | null
          misses?: string | null
          next_focus?: string | null
          updated_at?: string
          user_id: string
          week_start: string
          wins?: string | null
        }
        Update: {
          alignment_score?: number | null
          completed_at?: string | null
          created_at?: string
          execution_score?: number | null
          finance_note?: string | null
          finance_score?: number | null
          id?: string
          lessons?: string | null
          life_score?: number | null
          misses?: string | null
          next_focus?: string | null
          updated_at?: string
          user_id?: string
          week_start?: string
          wins?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      v_budget_node_tree: {
        Row: {
          archived: boolean | null
          color: string | null
          created_at: string | null
          depth: number | null
          icon: string | null
          id: string | null
          is_income: boolean | null
          name: string | null
          notes: string | null
          parent_id: string | null
          path_text: string | null
          sort_order: number | null
          sort_path: number[] | null
          updated_at: string | null
          user_id: string | null
        }
        Relationships: []
      }
      v_category_spend: {
        Row: {
          budget_category_id: string | null
          category_name: string | null
          month: string | null
          spent: number | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "transactions_budget_category_id_fkey"
            columns: ["budget_category_id"]
            isOneToOne: false
            referencedRelation: "budget_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      v_monthly_cashflow: {
        Row: {
          expense: number | null
          income: number | null
          month: string | null
          net: number | null
          user_id: string | null
        }
        Relationships: []
      }
      v_node_spend: {
        Row: {
          month: string | null
          node_id: string | null
          spent: number | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "transactions_budget_node_id_fkey"
            columns: ["node_id"]
            isOneToOne: false
            referencedRelation: "budget_nodes"
            referencedColumns: ["id"]
          },
        ]
      }
      v_node_spend_rollup: {
        Row: {
          month: string | null
          node_id: string | null
          spent_rollup: number | null
          user_id: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      is_signup_open: { Args: never; Returns: boolean }
    }
    Enums: {
      asset_event_type:
        | "acquisition"
        | "depreciation"
        | "revaluation"
        | "impairment"
        | "sale"
      asset_status: "owned" | "sold" | "impaired" | "retired"
      debt_status: "outstanding" | "partial" | "settled" | "late" | "cancelled"
      goal_status: "active" | "achieved" | "paused" | "cancelled"
      invoice_status:
        | "planned"
        | "issued"
        | "partially_paid"
        | "paid"
        | "cancelled"
      project_status:
        | "planning"
        | "active"
        | "on_hold"
        | "completed"
        | "cancelled"
      provision_status: "planned" | "partial" | "settled" | "cancelled"
      scenario_type: "optimistic" | "realistic" | "pessimistic"
      txn_type:
        | "expense"
        | "income"
        | "transfer"
        | "investment"
        | "asset_purchase"
        | "asset_sale"
        | "adjustment"
        | "enveloppe_projet"
        | "enveloppe_emprunt"
        | "debt_incur"
        | "dette"
        | "creance"
        | "receivable_collect"
      utility_type: "water" | "electricity" | "gas" | "other"
      wallet_status: "active" | "archived" | "closed"
      wallet_type:
        | "cash"
        | "hidden_cash"
        | "bank"
        | "mobile_money"
        | "savings"
        | "investment"
        | "project_fund"
        | "other"
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
      asset_event_type: [
        "acquisition",
        "depreciation",
        "revaluation",
        "impairment",
        "sale",
      ],
      asset_status: ["owned", "sold", "impaired", "retired"],
      debt_status: ["outstanding", "partial", "settled", "late", "cancelled"],
      goal_status: ["active", "achieved", "paused", "cancelled"],
      invoice_status: [
        "planned",
        "issued",
        "partially_paid",
        "paid",
        "cancelled",
      ],
      project_status: [
        "planning",
        "active",
        "on_hold",
        "completed",
        "cancelled",
      ],
      provision_status: ["planned", "partial", "settled", "cancelled"],
      scenario_type: ["optimistic", "realistic", "pessimistic"],
      txn_type: [
        "expense",
        "income",
        "transfer",
        "investment",
        "asset_purchase",
        "asset_sale",
        "adjustment",
        "enveloppe_projet",
        "enveloppe_emprunt",
        "debt_incur",
        "dette",
        "creance",
        "receivable_collect",
      ],
      utility_type: ["water", "electricity", "gas", "other"],
      wallet_status: ["active", "archived", "closed"],
      wallet_type: [
        "cash",
        "hidden_cash",
        "bank",
        "mobile_money",
        "savings",
        "investment",
        "project_fund",
        "other",
      ],
    },
  },
} as const

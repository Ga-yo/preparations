
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "candidates": {
                  Row: {
                    "complex_id": number,"condition_set_id": string,"cons": NonNullable<Json>,"created_at": string,"fit_score": number | null,"id": string,"is_favorite": boolean,"pros": NonNullable<Json>,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "complex_id": number,"condition_set_id": string,"cons"?: NonNullable<Json>,"created_at"?: string,"fit_score"?: number | null,"id"?: string,"is_favorite"?: boolean,"pros"?: NonNullable<Json>,"user_id"?: string
                  }
                  Update: {
                    "complex_id"?: number,"condition_set_id"?: string,"cons"?: NonNullable<Json>,"created_at"?: string,"fit_score"?: number | null,"id"?: string,"is_favorite"?: boolean,"pros"?: NonNullable<Json>,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "candidates_complex_id_fkey"
      columns: ["complex_id"]
isOneToOne: false
      referencedRelation: "complexes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "candidates_condition_set_id_user_id_fkey"
      columns: ["condition_set_id","user_id"]
isOneToOne: false
      referencedRelation: "condition_sets"
      referencedColumns: ["id","user_id"]
    }
                  ]
                },"chat_messages": {
                  Row: {
                    "content": string | null,"created_at": string,"id": number,"plan_id": string,"role": string,"tool_name": string | null,"tool_payload": Json | null,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "content"?: string | null,"created_at"?: string,"id"?: never,"plan_id": string,"role": string,"tool_name"?: string | null,"tool_payload"?: Json | null,"user_id"?: string
                  }
                  Update: {
                    "content"?: string | null,"created_at"?: string,"id"?: never,"plan_id"?: string,"role"?: string,"tool_name"?: string | null,"tool_payload"?: Json | null,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "chat_messages_plan_id_user_id_fkey"
      columns: ["plan_id","user_id"]
isOneToOne: false
      referencedRelation: "plans"
      referencedColumns: ["id","user_id"]
    }
                  ]
                },"chat_usage": {
                  Row: {
                    "count": number,"day": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "count"?: number,"day": string,"user_id"?: string
                  }
                  Update: {
                    "count"?: number,"day"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"complexes": {
                  Row: {
                    "approval_date": string | null,"bldrgst_pk": string | null,"builder": string | null,"building_count": number | null,"building_coverage_ratio": number | null,"data_as_of": string,"floor_area_ratio": number | null,"heating_type": string | null,"household_count": number | null,"housing_type": string,"id": number,"jibun": string | null,"jibun_address": string | null,"kapt_code": string | null,"location": unknown,"max_floor": number | null,"mgmt_fee_per_m2": number | null,"name": string,"parking_count": number | null,"region_code": string,"road_address": string | null,"site_area_m2": number | null,"source": string,"total_floor_area_m2": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "approval_date"?: string | null,"bldrgst_pk"?: string | null,"builder"?: string | null,"building_count"?: number | null,"building_coverage_ratio"?: number | null,"data_as_of": string,"floor_area_ratio"?: number | null,"heating_type"?: string | null,"household_count"?: number | null,"housing_type"?: string,"id"?: never,"jibun"?: string | null,"jibun_address"?: string | null,"kapt_code"?: string | null,"location"?: unknown,"max_floor"?: number | null,"mgmt_fee_per_m2"?: number | null,"name": string,"parking_count"?: number | null,"region_code": string,"road_address"?: string | null,"site_area_m2"?: number | null,"source": string,"total_floor_area_m2"?: number | null
                  }
                  Update: {
                    "approval_date"?: string | null,"bldrgst_pk"?: string | null,"builder"?: string | null,"building_count"?: number | null,"building_coverage_ratio"?: number | null,"data_as_of"?: string,"floor_area_ratio"?: number | null,"heating_type"?: string | null,"household_count"?: number | null,"housing_type"?: string,"id"?: never,"jibun"?: string | null,"jibun_address"?: string | null,"kapt_code"?: string | null,"location"?: unknown,"max_floor"?: number | null,"mgmt_fee_per_m2"?: number | null,"name"?: string,"parking_count"?: number | null,"region_code"?: string,"road_address"?: string | null,"site_area_m2"?: number | null,"source"?: string,"total_floor_area_m2"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "complexes_region_code_fkey"
      columns: ["region_code"]
isOneToOne: false
      referencedRelation: "regions"
      referencedColumns: ["code"]
    }
                  ]
                },"condition_sets": {
                  Row: {
                    "approval_year_min": number | null,"area_max": number | null,"area_min": number | null,"baths_min": number | null,"commute_minutes_max": number | null,"commute_region_code": string | null,"created_at": string,"direction_pref": string | null,"environment_prefs": (string)[],"floor_area_ratio_max": number | null,"floor_pref": string | null,"household_count_min": number | null,"household_size": number | null,"housing_types": (string)[],"id": string,"infra_importance": number | null,"mgmt_fee_per_m2_max": number | null,"parking_per_household_min": number | null,"parking_required": boolean | null,"plan_id": string,"price_max": number | null,"price_min": number | null,"priorities": NonNullable<Json>,"redevelopment_interest": boolean | null,"region_codes": (string)[],"region_reason": string | null,"rooms_min": number | null,"school_importance": number | null,"user_id": string,"uses_transit": boolean | null
                  }
                  ComputedFields: never
                  Insert: {
                    "approval_year_min"?: number | null,"area_max"?: number | null,"area_min"?: number | null,"baths_min"?: number | null,"commute_minutes_max"?: number | null,"commute_region_code"?: string | null,"created_at"?: string,"direction_pref"?: string | null,"environment_prefs"?: (string)[],"floor_area_ratio_max"?: number | null,"floor_pref"?: string | null,"household_count_min"?: number | null,"household_size"?: number | null,"housing_types"?: (string)[],"id"?: string,"infra_importance"?: number | null,"mgmt_fee_per_m2_max"?: number | null,"parking_per_household_min"?: number | null,"parking_required"?: boolean | null,"plan_id": string,"price_max"?: number | null,"price_min"?: number | null,"priorities"?: NonNullable<Json>,"redevelopment_interest"?: boolean | null,"region_codes"?: (string)[],"region_reason"?: string | null,"rooms_min"?: number | null,"school_importance"?: number | null,"user_id"?: string,"uses_transit"?: boolean | null
                  }
                  Update: {
                    "approval_year_min"?: number | null,"area_max"?: number | null,"area_min"?: number | null,"baths_min"?: number | null,"commute_minutes_max"?: number | null,"commute_region_code"?: string | null,"created_at"?: string,"direction_pref"?: string | null,"environment_prefs"?: (string)[],"floor_area_ratio_max"?: number | null,"floor_pref"?: string | null,"household_count_min"?: number | null,"household_size"?: number | null,"housing_types"?: (string)[],"id"?: string,"infra_importance"?: number | null,"mgmt_fee_per_m2_max"?: number | null,"parking_per_household_min"?: number | null,"parking_required"?: boolean | null,"plan_id"?: string,"price_max"?: number | null,"price_min"?: number | null,"priorities"?: NonNullable<Json>,"redevelopment_interest"?: boolean | null,"region_codes"?: (string)[],"region_reason"?: string | null,"rooms_min"?: number | null,"school_importance"?: number | null,"user_id"?: string,"uses_transit"?: boolean | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "condition_sets_commute_region_code_fkey"
      columns: ["commute_region_code"]
isOneToOne: false
      referencedRelation: "regions"
      referencedColumns: ["code"]
    },{
      foreignKeyName: "condition_sets_plan_id_user_id_fkey"
      columns: ["plan_id","user_id"]
isOneToOne: false
      referencedRelation: "plans"
      referencedColumns: ["id","user_id"]
    }
                  ]
                },"data_freshness": {
                  Row: {
                    "as_of": string,"collected_at": string,"dataset": string,"note": string | null,"source": string
                  }
                  ComputedFields: never
                  Insert: {
                    "as_of": string,"collected_at"?: string,"dataset": string,"note"?: string | null,"source": string
                  }
                  Update: {
                    "as_of"?: string,"collected_at"?: string,"dataset"?: string,"note"?: string | null,"source"?: string
                  }
                  Relationships: [
                    
                  ]
                },"financial_profiles": {
                  Row: {
                    "annual_income": number | null,"cash_assets": number | null,"child_count": number | null,"existing_debt": number | null,"existing_debt_annual_payment": number | null,"extra_funds": number | null,"has_newborn": boolean | null,"income_is_combined": boolean,"is_first_time": boolean | null,"is_newlywed": boolean | null,"owned_house_count": number,"plan_id": string,"purpose": string | null,"timeline": string | null,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "annual_income"?: number | null,"cash_assets"?: number | null,"child_count"?: number | null,"existing_debt"?: number | null,"existing_debt_annual_payment"?: number | null,"extra_funds"?: number | null,"has_newborn"?: boolean | null,"income_is_combined"?: boolean,"is_first_time"?: boolean | null,"is_newlywed"?: boolean | null,"owned_house_count"?: number,"plan_id": string,"purpose"?: string | null,"timeline"?: string | null,"updated_at"?: string,"user_id"?: string
                  }
                  Update: {
                    "annual_income"?: number | null,"cash_assets"?: number | null,"child_count"?: number | null,"existing_debt"?: number | null,"existing_debt_annual_payment"?: number | null,"extra_funds"?: number | null,"has_newborn"?: boolean | null,"income_is_combined"?: boolean,"is_first_time"?: boolean | null,"is_newlywed"?: boolean | null,"owned_house_count"?: number,"plan_id"?: string,"purpose"?: string | null,"timeline"?: string | null,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "financial_profiles_plan_id_user_id_fkey"
      columns: ["plan_id","user_id"]
isOneToOne: false
      referencedRelation: "plans"
      referencedColumns: ["id","user_id"]
    }
                  ]
                },"loan_products": {
                  Row: {
                    "asset_max": number | null,"data_as_of": string,"effective_date": string,"end_date": string | null,"exclusive_area_max": number | null,"house_price_max": number | null,"id": number,"income_max": number | null,"max_amount": number | null,"max_term_years": number | null,"name": string,"note": string | null,"product_type": string,"provider": string,"rate_max": number | null,"rate_min": number | null,"rate_type": string | null,"requires_first_time": boolean,"requires_homeless": boolean,"requires_newborn": boolean,"requires_newlywed": boolean,"source": string,"source_key": string | null,"source_url": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "asset_max"?: number | null,"data_as_of": string,"effective_date": string,"end_date"?: string | null,"exclusive_area_max"?: number | null,"house_price_max"?: number | null,"id"?: never,"income_max"?: number | null,"max_amount"?: number | null,"max_term_years"?: number | null,"name": string,"note"?: string | null,"product_type": string,"provider": string,"rate_max"?: number | null,"rate_min"?: number | null,"rate_type"?: string | null,"requires_first_time"?: boolean,"requires_homeless"?: boolean,"requires_newborn"?: boolean,"requires_newlywed"?: boolean,"source": string,"source_key"?: string | null,"source_url"?: string | null
                  }
                  Update: {
                    "asset_max"?: number | null,"data_as_of"?: string,"effective_date"?: string,"end_date"?: string | null,"exclusive_area_max"?: number | null,"house_price_max"?: number | null,"id"?: never,"income_max"?: number | null,"max_amount"?: number | null,"max_term_years"?: number | null,"name"?: string,"note"?: string | null,"product_type"?: string,"provider"?: string,"rate_max"?: number | null,"rate_min"?: number | null,"rate_type"?: string | null,"requires_first_time"?: boolean,"requires_homeless"?: boolean,"requires_newborn"?: boolean,"requires_newlywed"?: boolean,"source"?: string,"source_key"?: string | null,"source_url"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"loan_rules": {
                  Row: {
                    "area_type": string | null,"buyer_type": string | null,"effective_date": string,"end_date": string | null,"id": number,"lender_type": string | null,"note": string | null,"price_max": number | null,"price_min": number | null,"region_prefix": string | null,"rule_type": string,"source": string,"source_url": string | null,"unit": string,"value": number
                  }
                  ComputedFields: never
                  Insert: {
                    "area_type"?: string | null,"buyer_type"?: string | null,"effective_date": string,"end_date"?: string | null,"id"?: never,"lender_type"?: string | null,"note"?: string | null,"price_max"?: number | null,"price_min"?: number | null,"region_prefix"?: string | null,"rule_type": string,"source": string,"source_url"?: string | null,"unit": string,"value": number
                  }
                  Update: {
                    "area_type"?: string | null,"buyer_type"?: string | null,"effective_date"?: string,"end_date"?: string | null,"id"?: never,"lender_type"?: string | null,"note"?: string | null,"price_max"?: number | null,"price_min"?: number | null,"region_prefix"?: string | null,"rule_type"?: string,"source"?: string,"source_url"?: string | null,"unit"?: string,"value"?: number
                  }
                  Relationships: [
                    
                  ]
                },"plans": {
                  Row: {
                    "created_at": string,"current_stage": number,"id": string,"title": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"current_stage"?: number,"id"?: string,"title"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Update: {
                    "created_at"?: string,"current_stage"?: number,"id"?: string,"title"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"pois": {
                  Row: {
                    "attrs": NonNullable<Json>,"category": string,"data_as_of": string,"id": number,"location": unknown,"name": string,"region_code": string | null,"source": string,"source_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "attrs"?: NonNullable<Json>,"category": string,"data_as_of": string,"id"?: never,"location": unknown,"name": string,"region_code"?: string | null,"source": string,"source_id"?: string | null
                  }
                  Update: {
                    "attrs"?: NonNullable<Json>,"category"?: string,"data_as_of"?: string,"id"?: never,"location"?: unknown,"name"?: string,"region_code"?: string | null,"source"?: string,"source_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "pois_region_code_fkey"
      columns: ["region_code"]
isOneToOne: false
      referencedRelation: "regions"
      referencedColumns: ["code"]
    }
                  ]
                },"redevelopment_projects": {
                  Row: {
                    "area_m2": number | null,"complex_id": number | null,"data_as_of": string,"id": number,"location": unknown,"name": string,"project_type": string,"region_code": string | null,"source": string,"source_url": string | null,"stage": string,"stage_date": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "area_m2"?: number | null,"complex_id"?: number | null,"data_as_of": string,"id"?: never,"location"?: unknown,"name": string,"project_type": string,"region_code"?: string | null,"source": string,"source_url"?: string | null,"stage": string,"stage_date"?: string | null
                  }
                  Update: {
                    "area_m2"?: number | null,"complex_id"?: number | null,"data_as_of"?: string,"id"?: never,"location"?: unknown,"name"?: string,"project_type"?: string,"region_code"?: string | null,"source"?: string,"source_url"?: string | null,"stage"?: string,"stage_date"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "redevelopment_projects_complex_id_fkey"
      columns: ["complex_id"]
isOneToOne: false
      referencedRelation: "complexes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "redevelopment_projects_region_code_fkey"
      columns: ["region_code"]
isOneToOne: false
      referencedRelation: "regions"
      referencedColumns: ["code"]
    }
                  ]
                },"regions": {
                  Row: {
                    "code": string,"eupmyeondong": string | null,"full_name": string,"is_active": boolean,"ri": string | null,"sido": string,"sigungu": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "code": string,"eupmyeondong"?: string | null,"full_name": string,"is_active"?: boolean,"ri"?: string | null,"sido": string,"sigungu"?: string | null
                  }
                  Update: {
                    "code"?: string,"eupmyeondong"?: string | null,"full_name"?: string,"is_active"?: boolean,"ri"?: string | null,"sido"?: string,"sigungu"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"regulated_areas": {
                  Row: {
                    "area_type": string,"effective_date": string,"end_date": string | null,"id": number,"note": string | null,"region_code": string,"source": string,"source_url": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "area_type": string,"effective_date": string,"end_date"?: string | null,"id"?: never,"note"?: string | null,"region_code": string,"source": string,"source_url"?: string | null
                  }
                  Update: {
                    "area_type"?: string,"effective_date"?: string,"end_date"?: string | null,"id"?: never,"note"?: string | null,"region_code"?: string,"source"?: string,"source_url"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "regulated_areas_region_code_fkey"
      columns: ["region_code"]
isOneToOne: false
      referencedRelation: "regions"
      referencedColumns: ["code"]
    }
                  ]
                },"tips": {
                  Row: {
                    "body": string,"caution": string | null,"field_key": string | null,"id": number,"slug": string,"sort_order": number,"source": string | null,"stage": number,"title": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "body": string,"caution"?: string | null,"field_key"?: string | null,"id"?: never,"slug": string,"sort_order"?: number,"source"?: string | null,"stage": number,"title": string,"updated_at"?: string
                  }
                  Update: {
                    "body"?: string,"caution"?: string | null,"field_key"?: string | null,"id"?: never,"slug"?: string,"sort_order"?: number,"source"?: string | null,"stage"?: number,"title"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"transactions": {
                  Row: {
                    "build_year": number | null,"building_name": string,"cancel_date": string | null,"collected_at": string,"complex_id": number | null,"deal_amount": number,"deal_date": string,"deal_type": string | null,"exclusive_area": number,"floor": number | null,"id": number,"jibun": string | null,"property_type": string,"region_code": string,"source_key": string
                  }
                  ComputedFields: never
                  Insert: {
                    "build_year"?: number | null,"building_name": string,"cancel_date"?: string | null,"collected_at"?: string,"complex_id"?: number | null,"deal_amount": number,"deal_date": string,"deal_type"?: string | null,"exclusive_area": number,"floor"?: number | null,"id"?: never,"jibun"?: string | null,"property_type": string,"region_code": string,"source_key": string
                  }
                  Update: {
                    "build_year"?: number | null,"building_name"?: string,"cancel_date"?: string | null,"collected_at"?: string,"complex_id"?: number | null,"deal_amount"?: number,"deal_date"?: string,"deal_type"?: string | null,"exclusive_area"?: number,"floor"?: number | null,"id"?: never,"jibun"?: string | null,"property_type"?: string,"region_code"?: string,"source_key"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "transactions_complex_id_fkey"
      columns: ["complex_id"]
isOneToOne: false
      referencedRelation: "complexes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "transactions_region_code_fkey"
      columns: ["region_code"]
isOneToOne: false
      referencedRelation: "regions"
      referencedColumns: ["code"]
    }
                  ]
                }
          }
          Views: {
            "capital_sigungu": {
                  Row: {
                    "full_name": string,"sido": string,"sigungu_code": string | null
                  }
                  ComputedFields: never
                  Insert: {
                           "full_name"?: string | null,"sido"?: string | null,"sigungu_code"?: never
                         }
                        Update: {
                           "full_name"?: string | null,"sido"?: string | null,"sigungu_code"?: never
                         }
                        Relationships: [
                    
                  ]
                }
          }
          Functions: {
            "bump_chat_usage":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"complex_monthly_prices":
{ Args: { "area_max"?: number,"area_min"?: number,"months"?: number,"p_complex_id": number }; Returns: {
              "deal_count": number,"median_price": number,"month": string
            }[]
                           },
"complex_trades":
{ Args: { "area_max"?: number,"area_min"?: number,"lim"?: number,"p_complex_id": number }; Returns: {
              "deal_amount": number,"deal_date": string,"exclusive_area": number,"floor": number
            }[]
                           },
"complexes_for_conditions":
{ Args: { "area_max"?: number,"area_min"?: number,"months"?: number,"region_codes": (string)[] }; Returns: {
              "approval_year": number,"building_coverage_ratio": number,"complex_id": number,"deal_count": number,"floor_area_ratio": number,"household_count": number,"land_share_m2": number,"median_price": number,"name": string,"parking_per_household": number,"region_code": string
            }[]
                           },
"link_transactions_to_complexes":
{ Args: { "sgg": string }; Returns: {
              "ambiguous": number,"linked": number
            }[]
                           },
"region_price_stats":
{ Args: { "area_max"?: number,"area_min"?: number,"housing_type": string,"months": number,"sigungu_prefix": string }; Returns: {
              "deal_count": number,"latest_deal_date": string,"median_price": number,"sigungu_code": string,"sigungu_name": string
            }[]
                           },
"transaction_lots":
{ Args: { "sgg": string }; Returns: {
              "jibun": string,"linked": boolean,"region_code": string
            }[]
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            
          }
        }
} as const

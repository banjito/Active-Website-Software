export interface Database {
  neta_ops: {
    Tables: {
      jobs: {
        Row: {
          id: string;
          title: string;
          job_number: string;
          customer_id: string;
          site_address?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Insert: {
          id?: string;
          title: string;
          job_number?: string;
          customer_id: string;
          user_id?: string;
          description?: string;
          status?: string;
          division?: string;
          priority?: string;
          start_date?: string;
          due_date?: string;
          budget?: number;
          notes?: string;
          job_type?: string;
          portal_type?: string;
          site_address?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          title?: string;
          job_number?: string;
          customer_id?: string;
          user_id?: string;
          description?: string;
          status?: string;
          division?: string;
          priority?: string;
          start_date?: string;
          due_date?: string;
          budget?: number;
          notes?: string;
          job_type?: string;
          portal_type?: string;
          site_address?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
    };
  };
  common: {
    Tables: {
      customers: {
        Row: {
          id: string;
          name: string;
          company_name: string;
          address: string;
          created_at?: string;
          updated_at?: string;
        };
        Insert: {
          id?: string;
          name: string;
          company_name: string;
          address: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          company_name?: string;
          address?: string;
          created_at?: string;
          updated_at?: string;
        };
      };
    };
  };
} 
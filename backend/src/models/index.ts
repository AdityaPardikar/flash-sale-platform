// User model interface
export interface User {
  id: string;
  email: string;
  username: string;
  password_hash: string;
  created_at: Date;
  updated_at: Date;
}

// Product model interface
export interface Product {
  id: string;
  name: string;
  description: string;
  base_price: number;
  category: string;
  image_url: string;
  created_at: Date;
}

// Flash Sale model interface
export interface FlashSale {
  id: string;
  product_id: string;
  flash_price: number;
  quantity_available: number;
  start_time: Date;
  end_time: Date;
  status: 'upcoming' | 'active' | 'completed' | 'cancelled';
  created_at: Date;
}

// Queue Entry model interface
export interface QueueEntry {
  id: string;
  user_id: string;
  flash_sale_id: string;
  position: number;
  status: 'waiting' | 'reserved' | 'purchased' | 'cancelled';
  joined_at: Date;
}

// Order model interface
export interface Order {
  id: string;
  order_number: string;
  user_id: string;
  flash_sale_id: string;
  product_id: string;
  quantity: number;
  unit_price: string;
  total_amount: string;
  status: 'pending' | 'processing' | 'completed' | 'cancelled' | 'refunded';
  payment_status: 'pending' | 'processing' | 'completed' | 'failed' | 'refunded';
  payment_id?: string;
  payment_details?: Record<string, any>;
  shipping_address?: Record<string, any>;
  created_at: Date;
  updated_at: Date;
  completed_at?: Date;
}

// Analytics Event model interface
export interface AnalyticsEvent {
  id: string;
  event_type: string;
  user_id: string;
  flash_sale_id: string;
  data: Record<string, unknown>;
  created_at: Date;
}


/**
 * Общие типы моделей, чтобы контроллеры и сервисы могли разделять сигнатуры.
 */

export interface OrderRecord {
  id: number;
  tg_username: string | null;
  name: string | null;
  phone: string | null;
  order_type: string | null;
  date: string | null;
  time: string | null;
  address: string | null;
  items: unknown;
  total: number | null;
  comment: string | null;
  platform: string | null;
  created_at: string | Date;
}

export interface ReservationRecord {
  id: number;
  tg_username: string | null;
  name: string | null;
  phone: string | null;
  address: string | null;
  date: string | null;
  time: string | null;
  guests: number | null;
  comment: string | null;
  created_at: string | Date;
}

export interface MessageRecord {
  id: number;
  chat_id: number;
  from_me: boolean;
  text: string;
  date: string | Date | null;
}

export interface ChatRecord {
  chat_id: number;
  username: string | null;
  first_name: string | null;
  last_name: string | null;
  platform: string | null;
}

export interface ErrorResponse {
  error: string;
}

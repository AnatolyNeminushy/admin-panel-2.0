import type { DialogLike } from "./utils/chatUtils";

const API_BASE = import.meta.env.VITE_API_URL;

export interface ChatDialog extends DialogLike {
  id?: number | string;
  chat_id?: number | string;
  first_name?: string;
  last_name?: string;
  username?: string;
  [key: string]: unknown;
}

export interface ChatMessage {
  id?: number | string;
  chat_id?: number | string;
  from_me?: boolean;
  text?: string;
  date?: string | number | Date;
  is_bot?: boolean | 0 | 1 | "0" | "1" | null;
  _clientOrder?: number;
  [key: string]: unknown;
}

interface DialogsResponse {
  items?: ChatDialog[];
  total?: number;
  count?: number;
  totalCount?: number;
  [key: string]: unknown;
}

export async function fetchDialogs(search: string): Promise<{ items: ChatDialog[]; total: number }>
{
  const url = new URL(`${API_BASE}/chats`);
  url.searchParams.set("limit", "10000");
  url.searchParams.set("offset", "0");
  if (search.trim()) {
    url.searchParams.set("q", search.trim());
  }

  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new Error(`Failed to load dialogs: ${res.status}`);
  }

  const totalFromHeader = Number(res.headers.get("X-Total-Count"));
  const json = (await res.json().catch(() => ({}))) as DialogsResponse | ChatDialog[];

  let items: ChatDialog[] = [];
  let total = Number.isFinite(totalFromHeader) && totalFromHeader > 0 ? totalFromHeader : 0;

  if (Array.isArray(json)) {
    items = json;
    total = total || json.length;
  } else if (json && Array.isArray(json.items)) {
    items = json.items;
    const metaTotal = Number(json.total ?? json.count ?? json.totalCount);
    if (metaTotal && Number.isFinite(metaTotal) && metaTotal > 0) {
      total = metaTotal;
    } else if (!total) {
      total = items.length;
    }
  }

  return { items, total };
}

export async function fetchMessages(chatId: number | string): Promise<ChatMessage[]> {
  if (!chatId) return [];
  const url = new URL(`${API_BASE}/messages`);
  url.searchParams.set("chatId", String(chatId));

  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new Error(`Failed to load messages: ${res.status}`);
  }

  const raw = (await res.json().catch(() => [])) as ChatMessage[] | { items?: ChatMessage[] };
  const list = Array.isArray(raw) ? raw : Array.isArray(raw.items) ? raw.items : [];
  return list.map((m, index) => {
    const role = String(m.role || m.sender || m.author || m.sender_name || "").toLowerCase();
    const isBot =
      role === "bot" ||
      role === "assistant" ||
      role === "ai" ||
      m.is_bot === true ||
      m.is_bot === 1 ||
      m.is_bot === "1";
    const ts = Number.isFinite(Date.parse(String(m.date ?? ""))) ? Date.parse(String(m.date)) : index;
    return { ...m, is_bot: isBot, _clientOrder: ts };
  });
}

export interface SendMessagePayload {
  chatId: string | number;
  text: string;
}

export async function sendMessage({ chatId, text }: SendMessagePayload): Promise<ChatMessage> {
  const res = await fetch(`${API_BASE}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chatId, text }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error ?? "Не удалось отправить сообщение");
  }

  const data = (await res.json().catch(() => null)) as ChatMessage | null;
  if (!data) {
    throw new Error("Пустой ответ сервера");
  }
  return data;
}

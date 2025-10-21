# 📩 Сообщения гостям и рассылки

Чтобы отправлять личные сообщения или рассылки пользователям из админ-панели, используется **отдельный Telegram-бот**.

---

## ⚙️ Настройка бота

1. Создайте бота через [@BotFather](https://t.me/BotFather) и получите токен.
2. Укажите токен в `.env`:
TELEGRAM_BOT_TOKEN=123456:ABC...

markdown
3. Запустите сервис бота (может быть отдельный проект или контейнер).
4. Гость **должен первым написать боту** (нажать **Start**).  
Без этого у вас не будет `chat_id`, и сообщение не отправится.

---

## 📂 Таблица `chats`

Когда пользователь пишет боту впервые, сохраняется его `chat_id`.

**Структура таблицы:**

```sql
create table if not exists chats (
  id serial primary key,
  chat_id bigint unique not null,
  username text,
  first_name text,
  last_name text,
  platform text
);
id — внутренний ключ

chat_id — уникальный идентификатор чата в Telegram

username — @username (если есть)

first_name / last_name — имя и фамилия пользователя

platform — название платформы (telegram)

Пример вставки вручную:

sql

INSERT INTO chats (chat_id, username, first_name, last_name, platform)
VALUES (123456789, 'demo_user', 'Alex', 'Ivanov', 'telegram');
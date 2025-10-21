/**
 * Страница авторизации (логин) для административной панели.
 *
 * Зачем это нужно:
 * – Предоставляет пользователю безопасный вход в систему и перенаправление в раздел аналитики.
 * – Демонстрирует «контролируемые» поля ввода с явной типизацией (TypeScript) и дружелюбный UX:
 *   блокировка повторной отправки, наглядный лоадер, информативные ошибки.
 *
 * Что важно для поддержки/чтения кода:
 * – Обработчик отправки формы пишет на современный TS (исключаем `any`, работаем через `unknown` и узкое приведение).
 * – Используем нативные подсказки автобраузера (`autoComplete`) для email/пароля: это повышает DX/UX и security-гигиену.
 * – Ошибки показываются через `aria-live`/`role="alert"` — экранные дикторы будут корректно их озвучивать.
 */

import { AnimatePresence } from "framer-motion";
import { useState, useCallback, ChangeEvent, FormEvent } from "react";
import { useNavigate } from "react-router-dom";

import Button from "../../components/Button";
import Input from "../../components/Input";
import Loader from "../../components/Loader";
import VantaBg from "../../components/VantaBg";
import { useAuth } from "../../context/useAuth";

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();

  // Контролируемые поля: типизация значений помогает IDE и исключает случайные типы.
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // UI-состояния: понятные названия и строгая типизация строк ошибок.
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  // Подсказка: чистим ошибку при изменении инпутов, чтобы не “залипала” при следующем вводе.
  const handleEmailChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    if (err) setErr("");
    setEmail(e.target.value);
  }, [err]);

  const handlePasswordChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    if (err) setErr("");
    setPassword(e.target.value);
  }, [err]);

  // Современный обработчик отправки формы:
  // – Без `any` в ошибках: принимаем `unknown`, затем аккуратно сужаем тип.
  // – `finally` гарантирует снятие спиннера; при успешном логине сразу уходим на /analytics.
  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setErr("");
      setLoading(true);

      try {
        await login(email.trim(), password);
        navigate("/analytics");
      } catch (error: unknown) {
        // Внешние клиенты/SDK часто кладут полезное сообщение в response.data.error.
        let message = "Произошла неизвестная ошибка. Попробуйте ещё раз.";
        if (error instanceof Error && error.message) {
          message = error.message;
        } else if (
          typeof error === "object" &&
          error !== null &&
          "response" in error &&
          typeof (error as any).response?.data?.error === "string"
        ) {
          message = (error as any).response.data.error;
        }
        setErr(message);
      } finally {
        // Даже если уйдём на /analytics, размонтирование компонента снимет лоадер автоматически,
        // но `finally` делает поведение предсказуемым при любом исходе.
        setLoading(false);
      }
    },
    [email, password, login, navigate]
  );

  return (
    <div className="fixed inset-0 flex items-center justify-center">
      {/* Фоновая визуализация: легкий паралакс/шум, не мешает читабельности формы */}
      <VantaBg color={0x0d8d7e} backgroundColor={0x0c1633} showDots />

      {/* Лоадер размещаем через AnimatePresence, чтобы появление/скрытие были плавными */}
      <AnimatePresence>
        {loading ? (
          <Loader
            key="login-loader"
            fullscreen
            label="Проверяем входные данные..."
          />
        ) : null}
      </AnimatePresence>

      {/* Карточка формы: полупрозрачный фон + blur для читаемости поверх динамического бэкграунда */}
      <div className="relative z-10 w-[350px] bg-white/20 backdrop-blur-lg p-6 rounded-xl shadow">
        <h1 className="text-4xl font-bold text-center mb-4 gradient-chaos">
          NM.LAB
        </h1>

        <h2 className="text-xl font-medium text-white/80 text-center mb-4">
          Вход в админ-панель
        </h2>

        {/* Сообщение об ошибке: озвучивается скринридерами и визуально заметно */}
        {err && (
          <div
            className="text-body text-red-600 mb-2"
            role="alert"
            aria-live="polite"
          >
            {err}
          </div>
        )}

        {/* Подсказка: атрибуты autoComplete позволяют браузеру безопасно подставлять сохранённые данные */}
        <form className="space-y-4" onSubmit={handleSubmit} noValidate>
          <Input
            label="Email"
            name="email"
            type="email"
            value={email}
            onChange={handleEmailChange}
            inputMode="email"
            autoComplete="username"
            required
          />

          <Input
            label="Пароль"
            name="password"
            type="password"
            value={password}
            onChange={handlePasswordChange}
            autoComplete="current-password"
            required
          />

          {/* Кнопка не даст повторно отправить форму, пока идёт проверка */}
          <Button
            type="submit"
            disabled={loading}
            loading={loading}
            variant="primary"
          >
            Войти
          </Button>
        </form>
      </div>
    </div>
  );
}

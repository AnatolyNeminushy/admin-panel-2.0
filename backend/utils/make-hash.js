// Генератор bcrypt-хеша для ручной установки пароля.
// Запуск: docker compose exec backend node utils/make-hash.js <ваш-пароль>
// После генерации вставьте хеш в поле password_hash таблицы accounts.

const bcrypt = require("bcryptjs");

(async () => {
  // Забираем пароль из аргумента CLI; если его нет — подсказка и выход.
  const pwd = process.argv[2];
  if (!pwd) {
    console.error("Использование: node backend/utils/make-hash.js <password>");
    process.exit(1);
  }

  // Генерируем соль и хеш с 10 раундами — разумный баланс между безопасностью и скоростью.
  const hash = await bcrypt.hash(pwd, 10);

  // Печатаем результат, чтобы можно было вставить его в базу данных.
  console.log(hash);
})();

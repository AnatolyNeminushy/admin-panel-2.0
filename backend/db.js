// db.js
// Инициализация пула подключений к PostgreSQL с опциональным SSL (root.crt).

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

/**
 * SSL включается, если PGSSLMODE задан и не равен 'disable'.
 * Режим 'verify-full' включает строгую проверку сертификата.
 */
const useSSL = process.env.PGSSLMODE && process.env.PGSSLMODE !== 'disable';
const caPath = path.resolve(__dirname, 'root.crt');

const pool = new Pool({
  host: process.env.PGHOST,
  port: Number(process.env.PGPORT || 5432),
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  database: process.env.PGDATABASE,
  ssl: useSSL
    ? {
        rejectUnauthorized: process.env.PGSSLMODE === 'verify-full',
        // если root.crt лежит рядом с файлом — читаем и передаём в драйвер
        ca: fs.existsSync(caPath) ? fs.readFileSync(caPath, 'utf-8') : undefined,
      }
    : false,
});

module.exports = pool;

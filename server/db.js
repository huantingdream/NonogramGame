import mysql from 'mysql2/promise';
export function createPool(env = process.env) {
  for (const key of ['MYSQL_DATABASE', 'MYSQL_USER', 'MYSQL_PASSWORD']) if (!env[key]) throw new Error(`Missing ${key}`);
  return mysql.createPool({ host: env.MYSQL_HOST || '127.0.0.1', port: Number(env.MYSQL_PORT || 3306),
    database: env.MYSQL_DATABASE, user: env.MYSQL_USER, password: env.MYSQL_PASSWORD,
    connectionLimit: 8, timezone: 'Z', charset: 'utf8mb4', multipleStatements: false,
    supportBigNumbers: true, bigNumberStrings: false
  });
}

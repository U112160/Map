import pg from 'pg';

const { Pool } = pg;

const pool = new Pool({
  user: 'neondb_owner',
  host: 'ep-divine-dust-an9cpjk9-pooler.c-6.us-east-1.aws.neon.tech',
  database: 'neondb',
  password: 'npg_JmCRKL9aGi0u',
  port: 5432,
  ssl: {
    rejectUnauthorized: false,
  },
});

export const query = (text, params) => pool.query(text, params);
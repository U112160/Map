import pg from 'pg';

const { Pool } = pg;


export const query = (text, params) => pool.query(text, params);
import 'dotenv/config'; // auto-loads .env
import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
  user: process.env.PG_USER,
  password: process.env.PG_PASSWORD,
  host: process.env.PG_HOST,
  port: parseInt(process.env.PG_PORT),
  database: process.env.PG_DATABASE,
  ssl: {
    rejectUnauthorized: true,
    ca: process.env.PG_SSL_CA.replace(/\\n/g, '\n') // Restore newlines
  }
}); 



export default pool;

import mysql from "mysql2/promise";
import bcrypt from "bcryptjs";
import { env } from "../config/env";

export type PerfexStaffUser = {
  staffid: number;
  email: string;
  firstname: string | null;
  lastname: string | null;
  password: string;
  active: number;
};

const pool = mysql.createPool({
  host: env.PERFEX_DB_HOST,
  port: Number(env.PERFEX_DB_PORT),
  user: env.PERFEX_DB_USER,
  password: env.PERFEX_DB_PASSWORD,
  database: env.PERFEX_DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
});

const TABLE_PREFIX = env.PERFEX_DB_PREFIX || "tbl";

export async function findPerfexStaffByEmail(email: string): Promise<PerfexStaffUser | null> {
  console.log("Perfex DB config:", {
  host: env.PERFEX_DB_HOST,
  port: env.PERFEX_DB_PORT,
  user: env.PERFEX_DB_USER,
  database: env.PERFEX_DB_NAME,
  prefix: TABLE_PREFIX,
});
console.log("Looking up staff email:", email.trim());
  const sql = `
    SELECT
      staffid,
      email,
      firstname,
      lastname,
      password,
      active
    FROM ${TABLE_PREFIX}staff
    WHERE email = ?
    LIMIT 1
  `;

  const [rows] = await pool.query(sql, [email.trim()]);
  const result = rows as PerfexStaffUser[];

  if (!result.length) return null;
  if (result[0].active !== 1) return null;

  return result[0];
}

export async function verifyPerfexStaffPassword(
  plainPassword: string,
  hashedPassword: string
): Promise<boolean> {
  if (!hashedPassword) return false;

  try {
    return await bcrypt.compare(plainPassword, hashedPassword);
  } catch {
    return false;
  }
}
import { neon } from '@neondatabase/serverless';

// Esta URL te la da Neon cuando creas el proyecto
const sql = neon(process.env.DATABASE_URL!);

export async function getItems() {
  return await sql`SELECT * FROM items`;
}

export async function insertItem(item: any) {
  return await sql`
    INSERT INTO items (name, price, category, user_id)
    VALUES (${item.name}, ${item.price}, ${item.category}, ${item.userId})
    RETURNING *;
  `;
}
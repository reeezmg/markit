// server/api/changes.post.ts
import { z } from 'zod'
import { Pool } from 'pg'

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
})

// Define schema for incoming transaction data (adjusted for Product model)
const transactionsSchema = z.array(
  z.object({
    id: z.string(),
    changes: z.array(
      z.object({
        operation: z.string(),
        table_name: z.string(),
        value: z.object({
          id: z.string().uuid(),
          name: z.string().optional(),
          brand: z.string().optional(),
          status: z.boolean().optional(),
          rating: z.number().optional(),
          description: z.string().optional(),
          company_id: z.string().optional(),
          category_id: z.string().optional(),
          subcategory_id: z.string().nullable().optional(),
          purchaseorder_id: z.string().optional(),
          updated_at: z.string().optional(),
          created_at: z.string().optional()
        }),
        write_id: z.string(),
      })
    ),
  })
)

export default defineEventHandler(async (event) => {
  let data

  try {
    const body = await readBody(event)
    data = transactionsSchema.parse(body)
  } catch (err: any) {
    return sendError(event, createError({
      statusCode: 400,
      statusMessage: 'Invalid request',
      data: err.errors
    }))
  }

  const client = await pool.connect()

  try {
    await client.query('BEGIN')

    for (const tx of data) {
      for (const { operation, value, write_id, table_name } of tx.changes) {
        const table = table_name; // dynamic table name

        switch (operation) {
          case 'insert': {
            const insertFields = ['id'];
            const insertValues = [value.id];
            const placeholders = ['$1'];
            let paramIndex = 2;

            for (const [key, val] of Object.entries(value)) {
              if (val !== null && val !== undefined && key !== 'id') {
                console.log(`Inserting field: ${key} with value: ${val}`);
                insertFields.push(key);
                insertValues.push(val);
                placeholders.push(`$${paramIndex++}`);
              }
            }

            insertFields.push('write_id');
            insertValues.push(write_id);
            placeholders.push(`$${paramIndex++}`);

            const query = `
              INSERT INTO ${table} (${insertFields.join(', ')})
              VALUES (${placeholders.join(', ')})
              ON CONFLICT (id) DO NOTHING
            `;

            await client.query(query, insertValues);
            break;
          }

          case 'update': {
            const updates: string[] = [];
            const updateValues: any[] = [];
            let i = 1;

            for (const [key, val] of Object.entries(value)) {
              if (val !== null && val !== undefined && key !== 'id') {
                updates.push(`${key} = $${i++}`);
                updateValues.push(val);
              }
            }

            updates.push(`write_id = $${i++}`);
            updateValues.push(write_id);
            updateValues.push(value.id); // WHERE clause param

            const query = `
              UPDATE ${table}
              SET ${updates.join(', ')}
              WHERE id = $${i}
            `;

            await client.query(query, updateValues);
            break;
          }

          case 'delete': {
            const query = `DELETE FROM ${table} WHERE id = $1`;
            await client.query(query, [value.id]);
            break;
          }
        }
      }

    }

    await client.query('COMMIT')
  } catch (err) {
    await client.query('ROLLBACK')
    return sendError(event, createError({
      statusCode: 500,
      statusMessage: 'Failed to sync changes',
      data: err
    }))
  } finally {
    client.release()
  }

  return { status: 'OK' }
})

import { defineEventHandler, readBody, createError } from 'h3'
import { Pool } from 'pg'

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
})

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const { companyId, discountPercentage, filters } = body

  if (!companyId || !discountPercentage) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing required fields',
    })
  }

  const client = await pool.connect()

  try {
    const conditions: string[] = [`v.company_id = $1`]
    const params: any[] = [companyId]
    let paramIndex = params.length + 1

    // Category Filter
    if (filters.categoryId) {
      conditions.push(`c.id = $${paramIndex++}`)
      params.push(filters.categoryId)
    }

    // Subcategory Filter
    if (filters.subcategoryId) {
      conditions.push(`p.subcategory_id = $${paramIndex++}`)
      params.push(filters.subcategoryId)
    }

    // Status filter (Product.status)
    if (filters.status !== undefined && filters.status !== "") {
      conditions.push(`p.status = $${paramIndex++}`)
      params.push(filters.status)
    }

    // Date Range Filter
    if (filters.startDate && filters.endDate) {
      conditions.push(`p.created_at BETWEEN $${paramIndex++} AND $${paramIndex++}`)
      params.push(filters.startDate)
      params.push(filters.endDate)
    } else if (filters.startDate) {
      conditions.push(`p.created_at >= $${paramIndex++}`)
      params.push(filters.startDate)
    } else if (filters.endDate) {
      conditions.push(`p.created_at <= $${paramIndex++}`)
      params.push(filters.endDate)
    }

    // Brand Filter
    if (filters.brand) {
      conditions.push(`p.brand ILIKE $${paramIndex++}`)
      params.push(`%${filters.brand}%`)
    }

    // Rating Filter
    if (filters.minRating) {
      conditions.push(`p.rating >= $${paramIndex++}`)
      params.push(filters.minRating)
    }

    // Max selling price filter
    if (filters.maxSprice) {
      conditions.push(`v.s_price <= $${paramIndex++}`)
      params.push(filters.maxSprice)
    }

    // Min Margin Filter
    if (filters.minMargin) {
      conditions.push(`(v.s_price - COALESCE(v.p_price,0)) >= $${paramIndex++}`)
      params.push(filters.minMargin)
    }

    const whereSQL = conditions.join(' AND ')

    const updateSQL = `
      UPDATE variants v
      SET 
        discount = $${paramIndex},
        d_price = v.s_price - (v.s_price * $${paramIndex} / 100),
        updated_at = NOW()
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      WHERE v.product_id = p.id
      AND ${whereSQL}
      RETURNING v.id
    `

    params.push(discountPercentage)

    const { rows } = await client.query(updateSQL, params)
    return { success: true, updatedCount: rows.length }
  } catch (error: any) {
    console.error('❌ Discount API Error:', error)
    throw createError({
      statusCode: 500,
      statusMessage: error.message || 'Failed to apply discount',
    })
  } finally {
    client.release()
  }
})

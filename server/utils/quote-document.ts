import { quoteDocumentAddress } from '../../utils/quote-document'

// Callers authorize the selected company before reading public document branding.
export async function readQuoteDocumentCompany(db: any, companyId: string) {
  return (await db.query(`SELECT c.name AS "companyName",c.phone AS "companyPhone",c.logo,c.currency,c.gstin,
    c.email AS "companyEmail",json_build_object('formattedAddress',a.formatted_address,'houseDetails',a.house_details,
    'street',a.street,'locality',a.locality,'landmark',a.landmark,'city',a.city,'state',a.state,'pincode',a.pincode) AS address
    FROM companies c LEFT JOIN addresses a ON a.company_id=c.id AND a.active=true WHERE c.id=$1`, [companyId])).rows[0] || null
}
export async function readQuoteDocumentCustomerAddress(db: any, companyId: string, clientId: string) {
  if (!clientId) return ''
  const address = (await db.query(`SELECT a.formatted_address AS "formattedAddress",a.house_details AS "houseDetails",
    a.street,a.locality,a.landmark,a.city,a.state,a.pincode FROM addresses a
    JOIN company_clients cc ON cc.client_id=a.client_id AND cc.company_id=$1
    WHERE a.client_id=$2 AND a.active=true AND (a.company_id IS NULL OR a.company_id=$1)
    ORDER BY a.updated_at DESC,a.id LIMIT 1`, [companyId, clientId])).rows[0]
  return quoteDocumentAddress(address)
}

/** Adapt shared pg helpers to the request-local Prisma transaction. */
export function prismaSqlClient(db:any) {
  return {query:async(sql:string,args:any[]=[])=>{
    const statement=sql.trim();
    if (/^SELECT pg_advisory_xact_lock\(/i.test(statement) || (/^(INSERT|UPDATE|DELETE)\b/i.test(statement) && !/\bRETURNING\b/i.test(statement))) {
      const rowCount=await db.$executeRawUnsafe(sql,...args);
      return {rows:[],rowCount:Number(rowCount)};
    }
    const rows=await db.$queryRawUnsafe(sql,...args);
    return {rows,rowCount:rows.length};
  }};
}

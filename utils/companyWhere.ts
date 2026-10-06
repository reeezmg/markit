/** Append an ownership condition without nesting Prisma AND arrays. */
export function appendCompanyWhere(where: any, condition: any) {
  const clauses = where?.AND;
  return { ...where, AND: [...(Array.isArray(clauses) ? clauses : clauses ? [clauses] : []), condition] };
}

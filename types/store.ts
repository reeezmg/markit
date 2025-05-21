import type { Product, Category, Variant, Company } from '@prisma/client';

export type ProductWithVariants = Product & {
  variants: Variant[];
  company: Company;
  category?: Category;
};

export type CategoryWithProducts = Category & {
  products: ProductWithVariants[];
};

export type VariantWithProduct = Variant & {
  product: ProductWithVariants;
};
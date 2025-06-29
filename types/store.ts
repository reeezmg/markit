import type { Product, Category,Item, Variant, Company } from '@prisma/client';

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
  items: Item[];
};

export type WishlistVariant = Variant & {
  id: string;
  name: string;
  sprice: number;
  dprice: number | null;
  discount: number | null;
  images: string[];
  product: {
    id: string;
    name: string;
    description: string | null;

    company: {
      id: string;
      name: string;
    };
    variants: Array<{ id: string }>; // Simplified variant array
  };
  availableQty: number;
  isOutOfStock: boolean;
  mainImage: string | null;
};
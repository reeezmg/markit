// import { useFindManyProduct, useFindManyCategory } from '~/lib/hooks';
// import type { Prisma } from '@prisma/client';

// export const useStoreProducts = () => {
//   const route = useRoute();
  
//   // Helper function to create proper where conditions
//   const createProductWhere = (search = '') => {
//     const baseConditions: Prisma.ProductWhereInput[] = [
//       { status: true },
//       { company: { name: { equals: route.params.company as string } } },
//       { variants: { some: { images: { isEmpty: false } } } }
//     ];

//     if (search) {
//       baseConditions.push({ name: { contains: search } });
//     }

//     return { AND: baseConditions };
//   };

//   // Fetch products with pagination
//   const fetchProducts = async (page: number, pageSize: number, search = '') => {
//     const query: Prisma.ProductFindManyArgs = {
//       where: createProductWhere(search),
//       include: {
//         company: true,
//         variants: true,
//         category: true
//       },
//       skip: (page - 1) * pageSize,
//       take: pageSize
//     };

//     const { data } = await useFindManyProduct(query);
//     return data.value || [];
//   };

//   // Fetch trending products (newest first)
//   const fetchTrendingProducts = async (limit = 8) => {
//     const query: Prisma.ProductFindManyArgs = {
//       where: createProductWhere(),
//       include: {
//         company: true,
//         variants: true,
//         category: true
//       },
//       take: limit,
//       orderBy: {
//         createdAt: 'desc'
//       }
//     };
    
//     const { data } = await useFindManyProduct(query);
//     return data.value || [];
//   };

//   // Fetch all categories with some products
//   const fetchCategoriesWithProducts = async () => {
//     const query: Prisma.CategoryFindManyArgs = {
//       where: {
//         company: { name: { equals: route.params.company as string } },
//         status: true
//       },
//       include: {
//         products: {
//           where: { status: true },
//           include: { variants: true },
//           take: 4
//         }
//       }
//     };
    
//     const { data } = await useFindManyCategory(query);
//     return data.value || [];
//   };

//   // Fetch products by category
//   const fetchProductsByCategory = async (categoryId: string, page: number, pageSize: number) => {
//     const query: Prisma.ProductFindManyArgs = {
//       where: {
//         AND: [
//           { status: true },
//           { company: { name: { equals: route.params.company as string } } },
//           { categoryId },
//           { variants: { some: { images: { isEmpty: false } } } }
//         ]
//       },
//       include: {
//         company: true,
//         variants: true
//       },
//       skip: (page - 1) * pageSize,
//       take: pageSize
//     };
    
//     const { data } = await useFindManyProduct(query);
//     return data.value || [];
//   };

//   return {
//     fetchProducts,
//     fetchTrendingProducts,
//     fetchCategoriesWithProducts,
//     fetchProductsByCategory
//   };
// };


// import { ref, computed, watch } from 'vue'
// import { useRoute } from 'vue-router'
// import { useFindManyProduct, useFindManyCategory } from '~/lib/hooks'
// import type { Prisma } from '@prisma/client'

// export const useStoreProducts = ({
//   search,
//   sortOrder,
//   categoryFilter
// }: {
//   search: Ref<string>,
//   sortOrder: Ref<string>,
//   categoryFilter: Ref<string | null>
// }) => {
//   const route = useRoute()

//   const products = ref<any[]>([])
//   const page = ref(1)
//   const pageSize = 12
//   const isLoading = ref(false)
//   const isReachingEnd = ref(false)

//   const sortBy = computed<Prisma.ProductOrderByWithRelationInput>(() => {
//     switch (sortOrder.value) {
//       case 'Price: Low to High':
//         return { price: 'asc' }  // requires Product to have a `price` field
//       case 'Price: High to Low':
//         return { price: 'desc' }
//       default:
//         return { createdAt: 'desc' }
//     }
//   })
  

//   const buildWhere = (): Prisma.ProductWhereInput => {
//     const conditions: Prisma.ProductWhereInput[] = [
//       { status: true },
//       { company: { name: { equals: route.params.company as string } } },
//       { variants: { some: { images: { isEmpty: false } } } }
//     ]

//     if (search.value) {
//       conditions.push({ name: { contains: search.value, mode: 'insensitive' } })
//     }

//     if (categoryFilter.value) {
//       conditions.push({ category: { name: { equals: categoryFilter.value } } })
//     }

//     return { AND: conditions }
//   }

//   const fetchInitial = async () => {
//     page.value = 1
//     products.value = []
//     await fetchMore()
//   }

//   const fetchMore = async () => {
//     isLoading.value = true

//     const query: Prisma.ProductFindManyArgs = {
//       where: buildWhere(),
//       include: {
//         company: true,
//         variants: true,
//         category: true
//       },
//       orderBy: sortBy.value,
//       skip: (page.value - 1) * pageSize,
//       take: pageSize
//     }

//     const { data } = await useFindManyProduct(query)
//     const result = data.value || []

//     if (result.length < pageSize) {
//       isReachingEnd.value = true
//     }

//     products.value.push(...result)
//     page.value++
//     isLoading.value = false
//   }

//   const clearProducts = () => {
//     products.value = []
//     page.value = 1
//     isReachingEnd.value = false
//   }

//   const fetchTrendingProducts = async (limit = 8) => {
//     const query: Prisma.ProductFindManyArgs = {
//       where: buildWhere(),
//       include: {
//         company: true,
//         variants: true,
//         category: true
//       },
//       take: limit,
//       orderBy: {
//         createdAt: 'desc'
//       }
//     }

//     const { data } = await useFindManyProduct(query)
//     return data.value || []
//   }

//   const fetchCategories = async () => {
//     const query: Prisma.CategoryFindManyArgs = {
//       where: {
//         company: { name: { equals: route.params.company as string } },
//         status: true
//       },
//       include: {
//         products: {
//           where: { status: true },
//           include: { variants: true },
//           take: 4
//         }
//       }
//     }

//     const { data } = await useFindManyCategory(query)
//     return data.value || []
//   }

//   // Load trending and categories up-front
//   const trendingProducts = ref<any[]>([])
//   const categories = ref<any[]>([])

//   const initHomeData = async () => {
//     trendingProducts.value = await fetchTrendingProducts()
//     categories.value = await fetchCategories()
//   }

//   // Automatically reload when filters change
//   watch([search, sortOrder, categoryFilter], fetchInitial)

//   initHomeData()

//   return {
//     products,
//     trendingProducts,
//     categories,
//     isLoading,
//     isReachingEnd,
//     fetchMore,
//     fetchInitial,
//     clearProducts
//   }
// }

import { useFindManyProduct, useFindManyCategory } from '~/lib/hooks';
import type { Prisma } from '@prisma/client';
import { ref, computed } from 'vue';
import { useRoute } from 'vue-router';

export const useStoreProducts = ({
  search,
  sortOrder,
  categoryFilter
}: {
  search: Ref<string>,
  sortOrder: Ref<string>,
  categoryFilter: Ref<string | null>
}) => {
  const route = useRoute();

  const page = ref(1);
  const pageSize = 12;
  const products = ref<any[]>([]);
  const isLoading = ref(false);
  const isReachingEnd = ref(false);

  const trendingProducts = ref<any[]>([]);
  const categories = ref<any[]>([]);

  const sortBy = computed<Prisma.ProductOrderByWithRelationInput>(() => {
    switch (sortOrder.value) {
      case 'Price: Low to High':
        return { price: 'asc' };
      case 'Price: High to Low':
        return { price: 'desc' };
      default:
        return { createdAt: 'desc' };
    }
  });

  const buildWhere = (): Prisma.ProductWhereInput => {
    const base: Prisma.ProductWhereInput = {
      status: true,
      company: { name: { equals: route.params.company as string } },
      variants: { some: { images: { isEmpty: false } } }
    };

    if (search.value) {
      base.name = { contains: search.value, mode: 'insensitive' };
    }

    if (categoryFilter.value) {
      base.category = { name: categoryFilter.value };
    }

    return base;
  };

  const fetchInitial = async () => {
    page.value = 1;
    isLoading.value = true;

    const query: Prisma.ProductFindManyArgs = {
      where: buildWhere(),
      include: { company: true, variants: true, category: true },
      orderBy: sortBy.value,
      skip: 0,
      take: pageSize
    };

    const { data } = await useFindManyProduct(query);
    products.value = data.value || [];
    isReachingEnd.value = !data.value?.length;
    isLoading.value = false;
  };

  const fetchMore = async () => {
    if (isReachingEnd.value || isLoading.value) return;

    isLoading.value = true;
    page.value += 1;

    const query: Prisma.ProductFindManyArgs = {
      where: buildWhere(),
      include: { company: true, variants: true, category: true },
      orderBy: sortBy.value,
      skip: (page.value - 1) * pageSize,
      take: pageSize
    };

    const { data } = await useFindManyProduct(query);
    const newData = data.value || [];

    if (!newData.length) isReachingEnd.value = true;
    products.value.push(...newData);
    isLoading.value = false;
  };

  const clearProducts = () => {
    products.value = [];
    page.value = 1;
    isReachingEnd.value = false;
  };

  const fetchTrendingProducts = async (limit = 8) => {
    const query: Prisma.ProductFindManyArgs = {
      where: buildWhere(),
      include: {
        company: true,
        variants: true,
        category: true
      },
      take: limit,
      orderBy: {
        createdAt: 'desc'
      }
    };

    const { data } = await useFindManyProduct(query);
    trendingProducts.value = data.value || [];
  };

  const fetchCategoriesWithProducts = async () => {
    const query: Prisma.CategoryFindManyArgs = {
      where: {
        company: { name: { equals: route.params.company as string } },
        status: true
      },
      include: {
        products: {
          where: { status: true },
          include: { variants: true },
          take: 4
        }
      }
    };

    const { data } = await useFindManyCategory(query);
    categories.value = data.value || [];
  };

  // Preload trending and categories on first call
  fetchTrendingProducts();
  fetchCategoriesWithProducts();

  return {
    products,
    isLoading,
    isReachingEnd,
    fetchMore,
    clearProducts,
    fetchInitial,
    trendingProducts,
    categories
  };
};

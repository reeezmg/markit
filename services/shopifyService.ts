// services/shopifyService.ts
import axios from 'axios';
const useAuth = () => useNuxtApp().$auth;

const SHOPIFY_BASE_URL = 'https://bazaartests.myshopify.com/admin/api/2024-01';
const ACCESS_TOKEN = useAuth().session.value?.shopifyAccessToken;

const createProduct = async (productData: any) => {
  try {
    const response = await axios.post(
      `${SHOPIFY_BASE_URL}/products.json`,
      { product: productData },
      {
        headers: {
          'X-Shopify-Access-Token': ACCESS_TOKEN,
          'Content-Type': 'application/json',
        },
      }
    );
    return response.data;
  } catch (error) {
    console.error('Error creating product:', error);
    throw error;
  }
};

export default {
  createProduct,
};

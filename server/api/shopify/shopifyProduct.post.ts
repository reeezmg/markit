// server/api/shopify.ts
import axios from 'axios';


export default eventHandler(async (event) => {
  // Obtain session using useAuthSession
  const session = await useAuthSession(event);
  const ACCESS_TOKEN = session?.data.shopifyAccessToken;
  
  if (!ACCESS_TOKEN) {
    return { success: false, error: 'No access token found' };
  }

  const SHOPIFY_BASE_URL = 'https://bazaartests.myshopify.com/admin/api/2024-01';

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

  try {
    const body = await readBody(event);
    const productData = body.productData;

    if (!productData) {
      return { success: false, error: 'Product data is required' };
    }

    const product = await createProduct(productData);
    return { success: true, product };
  } catch (error) {
    return { success: false, error: error };
  }
});

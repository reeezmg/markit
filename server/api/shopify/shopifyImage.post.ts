import axios from 'axios';

export default eventHandler(async (event) => {
  // Obtain session using useAuthSession
  const session = await useAuthSession(event);
  const ACCESS_TOKEN = session?.data.shopifyAccessToken;

  if (!ACCESS_TOKEN) {
    return { success: false, error: 'No access token found' };
  }

  const SHOPIFY_BASE_URL = 'https://bazaartests.myshopify.com/admin/api/2024-01';

  const addProductImage = async (productId: string, imageData: any,i:number) => {
    try {
      const response = await axios.post(
        `${SHOPIFY_BASE_URL}/products/${productId}/images.json`,
        { image: {position:i,attachment:imageData.base64.split(',')[1],filename:imageData.uuid} },
        {
          headers: {
            'X-Shopify-Access-Token': ACCESS_TOKEN,
            'Content-Type': 'application/json',
          },
        }
      );
      return response.data;
    } catch (error) {
      // Return only relevant parts of the error object to avoid circular references
      console.error('Error adding product image:', error);

    }
  };

  try {
    const body = await readBody(event);
    const { productId, base64files } = body;

    if (!productId || !Array.isArray(base64files) || base64files.length === 0) {
      return { success: false, error: 'Product ID and an array of image data are required' };
    }

    // Array to hold the results of each API call
    const results = [];

    // Loop through the array of image data and make the API call for each item
    for (const image of base64files) {
        let i = 1
      try {
        const imageResponse = await addProductImage(productId, image ,i);
        results.push({ success: true, image: imageResponse });
        i=+1
      } catch (error) {
        results.push({ success: false, error: error });
      }
    }

    // Return all the results
    return { success: true, results };

  } catch (error) {
    // Return a simplified error message
    return { success: false, error: error || 'An error occurred' };
  }
});

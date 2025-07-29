import axios from 'axios';
import { eventHandler } from 'h3';
import { generateSign } from '../../utils/generateSign';

export default eventHandler(async (event) => {

  const uri = 'https://open-api.tiktokglobalshop.com/authorization/202309/shops'
  const timestamp = Math.floor(Date.now() / 1000).toString();

  const app_key = '6dhnd661mqugm'
  const app_secret = 'bbb9555a4fd1edfb80aff57101f7e97ae616ce38'
  const requestOption = {
   uri: `${uri}?app_key=${app_key}&timestamp=${timestamp}`,
   qs: {
     app_key,
     timestamp
   },
   headers: {
     'content_type': 'application/json',  // This might need to be 'content-type' instead
   },
 };

 const sign = generateSign(requestOption, app_secret);
  let config = {
    maxBodyLength: Infinity,
    headers: {
      'x-tts-access-token': 'GCP_v7Lw6QAAAABzHMDfCWKrvA2-5po3akzx9Go1yCdxkT4OfVl1aDEkSBesHMaSjFZjM3DVGe1_kZ1ZA7gkahSG5wFlNiJtZ0mdLk_Q9MWi74Ik0C-fSaPpcWl_76XqWmSmGtq8hgLq_VU',
      'content-type': 'application/json',
    },
  };

  try {
    // Make the external API request
    const response = await axios.get(
      `https://open-api.tiktokglobalshop.com/authorization/202309/shops?app_key=${app_key}&sign=${sign}&timestamp=${timestamp}`,
      config
    );
    // Extract and return only the relevant data
    return { success: true, data: response.data };
  } catch (error: any) {
    // Extract and return the error message
    return { success: false, error: error.message };
  }
});

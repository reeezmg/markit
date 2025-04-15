import axios from 'axios';
import FormData from 'form-data';
import fs from 'fs/promises';
import { generateSign } from '../../utils/generateSign';
import path from 'path';

export default eventHandler(async (event) => {
  try {
    // File path
    const imagePath = 'C:/Users/User/Downloads/Group 1.jpg';

    // TikTok API URL
    const uri = 'https://open-api.tiktokglobalshop.com/product/202309/images/upload';

    // Timestamp and API credentials
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const app_secret = 'bbb9555a4fd1edfb80aff57101f7e97ae616ce38';
    const app_key = '6dhnd661mqugm';

    // Read the file into a buffer
    const fileBuffer = await fs.readFile(imagePath);

    // Create a new FormData instance
    const form = new FormData();
    form.append('data', fileBuffer); // Append file buffer to FormData

    // Generate the signature
    const requestOption = {
      uri: `${uri}?app_key=${app_key}&timestamp=${timestamp}`,
      qs: {
        app_key,
        timestamp,
      },
      body: form,
      headers: form.getHeaders(),
    };

    const sign = await generateSign(requestOption, app_secret);

    // Configure Axios request
    const config = {
      method: 'post',
      maxBodyLength: Infinity,
      url: `${uri}?app_key=${app_key}&sign=${sign}&timestamp=${timestamp}`,
      headers: {
        ...form.getHeaders(), // Use FormData headers
        'x-tts-access-token': 'GCP_ovmJ3wAAAABzHMDfCWKrvA2-5po3akzxKmd4Omx7VzfUjMIJSd5OHPLQvG5gf9t_u1Vc1ziM7ke1yjw804ErtpRDM7hRuxAk_fp2wCBzm3MMVI007EE1r-fWOHDkqCSMdfQhRLcWkAA',
      },
      data: form, // Pass FormData instance as data
    };

    // Send the request
    const response = await axios.request(config);
    console.log(JSON.stringify(response.data));
  } catch (error) {
    console.error('Error uploading image:', error || String(error));
  }
});

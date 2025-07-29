import axios from 'axios';
import { eventHandler } from 'h3';
import { generateSign } from '../../utils/generateSign';
import { updateCompanyForTiktok } from '~/server/utils/tiktokDB';


export default eventHandler(async (event) => {

  const uri = 'https://auth.tiktok-shops.com/api/v2/token/get'
  const app_key = '6dhnd661mqugm'
  const app_secret = 'bbb9555a4fd1edfb80aff57101f7e97ae616ce38'
  const body = await readBody(event);
  const code = body.code;
  const companyId = body.companyId;
  const shopuri = 'https://open-api.tiktokglobalshop.com/authorization/202309/shops'
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const sign = generateSign(shopuri,timestamp);

  

  try {
    // Make the external API request
    const response = await axios.get(
      `${uri}?app_key=${app_key}&app_secret=${app_secret}&auth_code=${code}&grant_type=authorized_code`
    );
    let config = {
      maxBodyLength: Infinity,
      headers: {
        'x-tts-access-token': 'GCP_ovmJ3wAAAABzHMDfCWKrvA2-5po3akzxKmd4Omx7VzfUjMIJSd5OHPLQvG5gf9t_u1Vc1ziM7ke1yjw804ErtpRDM7hRuxAk_fp2wCBzm3MMVI007EE1r-fWOHDkqCSMdfQhRLcWkAA',
        'content-type': 'application/json',
      },
    };
    const shopresponse = await axios.get(
      `https://open-api.tiktokglobalshop.com/authorization/202309/shops?app_key=${app_key}&sign=${sign}&timestamp=${timestamp}`,
      config
    );

    console.log(shopresponse)

    // Extract and return only the relevant data
    await updateCompanyForTiktok(response.data.data.access_token,response.data.data.access_token_expire_in, response.data.data.refresh_token, response.data.data.refresh_token_expire_in,companyId,shopresponse.data.data.shops[0].cipher,shopresponse.data.data.shops[0].name)
    return { success: true, data: shopresponse.data };
  } catch (error: any) {
    // Extract and return the error message
    console.log(error)
    return { success: false, error: error.message };
  }
});

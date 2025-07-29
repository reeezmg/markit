import { updateCompany } from "../utils/db";

export default eventHandler(async (event) => {
    const { shopifyStoreName, shopifyAccessToken,companyId } = await readBody(event);
    const company = await updateCompany(shopifyStoreName, shopifyAccessToken,companyId);

 
    return {status:true}
});

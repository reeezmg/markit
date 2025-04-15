import axios from 'axios';

export const getShopName = async () => {
    try {
      const response = await axios.get('/api/tiktok/getShopName');
      console.log(JSON.stringify(response.data));
      return response.data;
    } catch (error) {
      console.error(error);
    }
  };
  
  export const getToken = async (code:string,companyId:string | undefined) => {
    try {
      const response = await axios.post('/api/tiktok/getToken',{code,companyId});
      console.log(response.data)
      return response.data;
    } catch (error) {
      console.error(error);
    }
  };

  export const postImage = async (file: File) => {
    try {
      const reader = new FileReader();
  
      // Convert the file to Base64
      reader.onloadend = async () => {
        const base64Image = reader.result as string;
        // Remove the data URL prefix
        const base64String = base64Image;
  
        // Send the Base64 image to your API
        const response = await axios.post('/api/tiktok/postImage', {image:base64String}  );
        console.log(JSON.stringify(response.data));
        return response.data;
      };
  
      reader.onerror = (error) => {
        console.error("Error reading file:", error);
      };
  
      reader.readAsDataURL(file);
    } catch (error) {
      console.error("Error uploading image:", error);
    }
  };
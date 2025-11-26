export default eventHandler(async (event) => {
    const { email } = await readBody(event);
  
    const user = await findUserByEmail(email);
  
    return  user ? true : false;
  });
  
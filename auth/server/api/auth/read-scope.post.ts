export default eventHandler(() => {
  throw createError({ statusCode: 410, statusMessage: 'Company filters belong to individual requests' });
});

export default eventHandler(async (event) => {
  const session = await useAuthSession(event);
  const body = await readBody(event);

  const {
    id,
    cleanup,
    description,
    thankYouNote,
    refundPolicy,
    returnPolicy,
    companyPhone,
    image,
    companyId,
    companyType,
    companyName,
    storeUniqueName,
    isTaxIncluded,
    isUserTrackIncluded,
    pointsValue,
    currency,
    role,
    pipelineId,
    address,
    gstin,
    accHolderName,
    upiId,
    type,
    code,
    plan,
    logo,
    productInputs,
    variantInputs
  } = body;

  await session.update({
    id,
    cleanup,
    description,
    thankYouNote,
    refundPolicy,
    returnPolicy,
    companyPhone,
    image,
    companyId,
    companyType,
    companyName,
    storeUniqueName,
    isTaxIncluded,
    isUserTrackIncluded,
    pointsValue,
    currency,
    role,
    pipelineId,
    address,
    gstin,
    accHolderName,
    upiId,
    type,
    code,
    plan,
    logo,
    productInputs,
    variantInputs
  });
console.log("session",session.data)
  return session;
});

// Validate transport syntax here; storefrontAgent resolves available models and
// company-owned providers before starting an interaction.
export function isStorefrontModelKey(model: string): boolean {
  return /^[a-z0-9.\-]{1,40}$/.test(model)
    || /^bedrock:[a-z0-9.\-]{1,72}(?::[0-9]{1,3})?$/.test(model)
    || /^byok:[0-9a-f-]{36}$/i.test(model)
}

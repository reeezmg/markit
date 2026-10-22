import * as sessionSettings from '~/auth/composables/auth';

/** Each keyed settings page owns a fixed company context, including pending saves. */
export async function useSettingsCompany() {
  const scope = useCompanyScope('form', true);
  const actualAuth = useNuxtApp().$auth;
  const target = useRoute().query.entryCompany;
  await scope.ready;
  if (typeof target === 'string' && target && target !== scope.companyId.value) await scope.selectCompany(target);

  const sync = (fn: (...args: any[]) => Promise<any>) => async (...args: any[]) => {
    // Legacy helpers update the authentication cookie. Never put branch values there.
    if (scope.companyId.value === actualAuth.session.value?.companyId) await fn(...args);
    await scope.refreshSettings();
  };
  return {
    scope, auth: scope.auth, fetch: scope.fetch,
    updateStoreUniqueName: sync(sessionSettings.updateStoreUniqueName),
    updateStorePhone: sync(sessionSettings.updateStorePhone),
    updateStoreNote: sync(sessionSettings.updateStoreNote),
    updateAccountDetails: sync(sessionSettings.updateAccountDetails),
    updateAddress: sync(sessionSettings.updateAddress),
    updateIsTaxIncluded: sync(sessionSettings.updateIsTaxIncluded),
    updateIsAiImage: sync(sessionSettings.updateIsAiImage),
    updateIsUserTrackIncluded: sync(sessionSettings.updateIsUserTrackIncluded),
    updateIsCostIncluded: sync(sessionSettings.updateIsCostIncluded),
    updatePointsValue: sync(sessionSettings.updatePointsValue),
    updateTimeValue: sync(sessionSettings.updateTimeValue),
    updateCategoryValue: sync(sessionSettings.updateCategoryValue),
    updatePrinterLabelSize: sync(sessionSettings.updatePrinterLabelSize),
    updateLogo: sync(sessionSettings.updateLogo),
    updateDeliveryConfig: sync(sessionSettings.updateDeliveryConfig),
    updateDeliveryType: sync(sessionSettings.updateDeliveryType),
    updateSession: sync(sessionSettings.updateSession),
    updatePrefixes: sync(sessionSettings.updatePrefixes),
    startNewYear: sync(sessionSettings.startNewYear),
    async updateProfileDetails(name: string | null, email: string | null, image: string | null) {
      // Email/avatar are user-wide; the display name is a company membership field.
      const active = scope.companyId.value === actualAuth.session.value?.companyId;
      if (active || email != null || image != null)
        await sessionSettings.updateProfileDetails(active ? name : null, email, image);
      await scope.refreshSettings();
    },
  };
}

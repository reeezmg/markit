import { VueQueryPlugin, QueryClient, dehydrate, hydrate, type DehydratedState } from '@tanstack/vue-query'
import { defineNuxtPlugin, useState, onNuxtReady } from '#app'
import { serialize, deserialize } from '@zenstackhq/runtime/browser'

export default defineNuxtPlugin((nuxtApp) => {
  const state = useState<ReturnType<typeof serialize> | null>('vue-query', () => null);
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 1000 * 60 * 5, // 5 minutes
        retryOnMount: import.meta.server,
      },
    },
  });

  nuxtApp.vueApp.use(VueQueryPlugin, { queryClient });

  // Each request owns its cache. Transfer the rendered query data through
  // Nuxt's payload so the browser starts with the same rows and loading state.
  if (import.meta.server) {
    nuxtApp.hooks.hook('app:rendered', () => {
      // Use the model API's serializer for Decimal, Date and other model values.
      const snapshot = dehydrate(queryClient, { shouldDehydrateQuery: query => query.state.status !== 'pending' });
      for (const query of snapshot.queries) if (query.state.status === 'error') {
        // Transfer the error state without server stack traces or database details.
        const error = { name: 'Error', message: 'Unable to load data. Try again.' };
        query.state.error = error;
        query.state.fetchFailureReason = error;
      }
      state.value = serialize(snapshot);
    });
  }
  if (import.meta.client) {
    if (state.value) hydrate(queryClient, deserialize(state.value.data, state.value.meta) as DehydratedState);
    onNuxtReady(() => {
      queryClient.setDefaultOptions({ queries: { staleTime: 1000 * 60 * 5, retryOnMount: true } });
    });
  }
});

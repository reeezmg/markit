// plugins/fetch.ts
export default defineNuxtPlugin(() => {
  const customFetch = $fetch.create({
    credentials: 'include', // <--- important

  });

  // Replace global $fetch so ZenStack will use this version
  globalThis.$fetch = customFetch;
});

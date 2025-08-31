// middleware/lastRoute.global.ts
export default defineNuxtRouteMiddleware((to) => {
  if (process.client) {
    localStorage.setItem("lastRoute", to.fullPath);
  }
});

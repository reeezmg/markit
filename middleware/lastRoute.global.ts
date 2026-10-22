// middleware/lastRoute.global.ts
export default defineNuxtRouteMiddleware((to) => {
  if (process.client && !to.path.startsWith('/receipt/')) {
    localStorage.setItem("lastRoute", to.fullPath);
  }
});

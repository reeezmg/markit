export default defineEventHandler((event) => {
  setResponseHeaders(event, {
    "Access-Control-Allow-Origin": "*", // or specific domain e.g. "https://myfrontend.com"
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  });

  // Handle preflight requests
  if (getMethod(event) === "OPTIONS") {
    event.node.res.statusCode = 204;
    return null;
  }
});

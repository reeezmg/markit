export default defineEventHandler((event) => {
  const origin = getRequestHeader(event, "origin") || ""

  // Allowed origins: browser frontend + capacitor
  const allowedOrigins = [
    "http://localhost",          // Capacitor Android
    "capacitor://localhost",     // Capacitor iOS
  ]

  if (allowedOrigins.includes(origin)) {
    setResponseHeaders(event, {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Allow-Credentials": "true", // ✅ important for cookies
    })
  }

  // Handle preflight (OPTIONS)
  if (getMethod(event) === "OPTIONS") {
    event.node.res.statusCode = 204
    return null
  }
})

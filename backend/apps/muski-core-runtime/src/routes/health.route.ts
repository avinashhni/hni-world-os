export function healthRoute() {
  return {
    status: "ok",
    service: "muski-core-runtime",
    timestamp: new Date().toISOString(),
  };
}
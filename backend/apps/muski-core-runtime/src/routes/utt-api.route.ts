interface UttApiRouteContract {
  getApiRoutes(): string[];
}

export function createUttApiRoute(uttEnterprise: UttApiRouteContract) {
  return () => uttEnterprise.getApiRoutes();
}

const LOCAL_DEV_HOST = "localhost";

export function isLoopbackHost(host: string): boolean {
  return host === "localhost" || host === "127.0.0.1" || host === "[::1]";
}

export function clientReachableHost(): string {
  if (typeof window === "undefined") return LOCAL_DEV_HOST;
  return window.location.hostname;
}

import { QueryCache, QueryClient, QueryFunction } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import { demoApiRequest } from "./demo-store";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    let message = text;
    try {
      const body = JSON.parse(text);
      message = body.error || body.message || text;
      if (body.details && body.details !== message) message = `${message} (${body.details})`;
    } catch {
      if (text.trimStart().startsWith("<")) message = "The server returned a web page instead of data. The API may not be running.";
    }
    // Stale/expired session: clear it and go to login instead of erroring in a loop.
    throw new Error(`${res.status}: ${message}`);
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const res = await demoApiRequest(method, url, data);

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const res = await demoApiRequest("GET", queryKey.join("/") as string);

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    const contentType = res.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      throw new Error("The server returned a web page instead of data. The API may not be running.");
    }
    return await res.json();
  };

// Failed loads used to fall back to empty lists silently; surface them instead (one toast per message).
const recentErrors = new Map<string, number>();
const queryCache = new QueryCache({
  onError: (error) => {
    const message = error instanceof Error ? error.message : String(error);
    const now = Date.now();
    if ((recentErrors.get(message) || 0) > now - 10000) return;
    recentErrors.set(message, now);
    toast({ title: "Couldn't load data", description: message, variant: "destructive" });
  },
});

export const queryClient = new QueryClient({
  queryCache,
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});

/**
 * Global TanStack Query Client
 *
 * Configured with 15-second cache staleness window and single-retry policy.
 * Exported so that non-React modules (such as the authentication store and
 * logout lifecycle handlers) can invoke `queryClient.clear()` to purge cached
 * user-specific data upon session termination or user switching.
 */

import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      retry: 1,
    },
  },
});

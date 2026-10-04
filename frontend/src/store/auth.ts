/**
 * Global Authentication State Store (Zustand)
 *
 * Manages operator authentication status and current user profile in client memory.
 * Synchronizes login status to `localStorage.newtonite_is_logged_in` so that:
 *   1. Initial page load immediately recognizes authenticated status.
 *   2. Cross-tab logout: clearing the key in one tab fires a `storage` event in all
 *      other open tabs, synchronizing logout across the entire browser.
 */

import { create } from "zustand";
import type { User } from "@/types";

type AuthState = {
  isAuthenticated: boolean;
  user: User | null;
  setAuth: (user: User | null) => void;
  setUser: (user: User | null) => void;
  logout: () => void;
};

// Check initial status from local storage flag
const storedAuth = localStorage.getItem("newtonite_is_logged_in") === "true";

export const useAuthStore = create<AuthState>((set) => ({
  isAuthenticated: storedAuth,
  user: null,

  /**
   * Set user as authenticated and persist sync flag to localStorage.
   */
  setAuth: (user) => {
    localStorage.setItem("newtonite_is_logged_in", "true");
    set({ isAuthenticated: true, user });
  },

  /**
   * Update cached user profile details in memory.
   */
  setUser: (user) => set({ user }),

  /**
   * Purge local authentication state and clear synchronization flag.
   */
  logout: () => {
    localStorage.removeItem("newtonite_is_logged_in");
    set({ isAuthenticated: false, user: null });
  },
}));


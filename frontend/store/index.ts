import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { UserRole } from "@chatcraft/shared";

export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  role: UserRole;
  avatarUrl: string | null;
  accessToken: string;
}

export interface AgencyTheme {
  primaryColour?: string;
  logo?: string;
  name?: string;
  favicon?: string;
}

interface AuthState {
  user: AuthUser | null;
  isAuthenticated: boolean;
  setUser: (user: AuthUser | null) => void;
  clearAuth: () => void;
  agencyTheme: AgencyTheme | null;
  setAgencyTheme: (theme: AgencyTheme | null) => void;
}

interface UIState {
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  toggleSidebar: () => void;
  upgradeModalOpen: boolean;
  upgradeModalReason: string;
  openUpgradeModal: (reason?: string) => void;
  closeUpgradeModal: () => void;
  hardPaywallOpen: boolean;
  hardPaywallCap: number;
  openHardPaywall: (cap?: number) => void;
  closeHardPaywall: () => void;
}

type AppState = AuthState & UIState;

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      user: null,
      isAuthenticated: false,
      setUser: (user) => set({ user, isAuthenticated: !!user }),
      clearAuth: () => set({ user: null, isAuthenticated: false }),
      agencyTheme: null,
      setAgencyTheme: (agencyTheme) => set({ agencyTheme }),

      sidebarOpen: true,
      setSidebarOpen: (open) => set({ sidebarOpen: open }),
      toggleSidebar: () =>
        set((state) => ({ sidebarOpen: !state.sidebarOpen })),

      upgradeModalOpen: false,
      upgradeModalReason: "",
      openUpgradeModal: (reason = "") =>
        set({ upgradeModalOpen: true, upgradeModalReason: reason }),
      closeUpgradeModal: () =>
        set({ upgradeModalOpen: false, upgradeModalReason: "" }),

      hardPaywallOpen: false,
      hardPaywallCap: 0,
      openHardPaywall: (cap = 0) => set({ hardPaywallOpen: true, hardPaywallCap: cap }),
      closeHardPaywall: () => set({ hardPaywallOpen: false, hardPaywallCap: 0 }),
    }),
    {
      name: "chatcraft-store",
      storage: createJSONStorage(() => localStorage),
      // Only persist UI prefs — auth state comes from NextAuth on every load
      partialize: (state) => ({ sidebarOpen: state.sidebarOpen }),
    }
  )
);

// Convenience selectors
export const useUser = () => useAppStore((s) => s.user);
export const useIsAuthenticated = () => useAppStore((s) => s.isAuthenticated);
export const useUserRole = () => useAppStore((s) => s.user?.role ?? null);

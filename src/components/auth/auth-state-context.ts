"use client";

import { createContext, useContext } from "react";
import { DEFAULT_AUTH_STATE, type AuthState } from "@/lib/auth-state";

export type AuthStateContextValue = {
  auth: AuthState;
  refreshProfile: () => Promise<void>;
};

const defaultAuthContextValue: AuthStateContextValue = {
  auth: DEFAULT_AUTH_STATE,
  refreshProfile: async () => {},
};

export const AuthStateContext = createContext<AuthStateContextValue>(defaultAuthContextValue);

export const useAuthState = () => useContext(AuthStateContext).auth;

export const useRefreshAuthProfile = () => useContext(AuthStateContext).refreshProfile;

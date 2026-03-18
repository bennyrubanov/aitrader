"use client";

import { createContext, useContext } from "react";
import { DEFAULT_AUTH_STATE, type AuthState } from "@/lib/auth-state";

type AuthStateContextValue = AuthState;

export const AuthStateContext = createContext<AuthStateContextValue>(DEFAULT_AUTH_STATE);

export const useAuthState = () => useContext(AuthStateContext);

"use client";

import { createContext, useContext } from "react";

export type SignupPromptOpenOpts = {
  /** Guest tapped Follow on Explore — title emphasizes following. */
  fromFollow?: boolean;
};

export type AccountSignupPromptContextValue = {
  openSignupPrompt: (opts?: SignupPromptOpenOpts) => void;
};

export const AccountSignupPromptContext =
  createContext<AccountSignupPromptContextValue | null>(null);

export function useAccountSignupPrompt() {
  const ctx = useContext(AccountSignupPromptContext);
  if (!ctx) {
    throw new Error("useAccountSignupPrompt must be used within AccountSignupPromptProvider");
  }
  return ctx;
}

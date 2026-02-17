'use client';

import Script from 'next/script';
import { createClient } from '@/utils/supabase/browser';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

// Google One-Tap types
type CredentialResponse = {
  credential: string;
  select_by?: string;
};

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: {
            client_id: string;
            callback: (response: CredentialResponse) => void;
            nonce?: string;
            use_fedcm_for_prompt?: boolean;
            auto_select?: boolean;
            cancel_on_tap_outside?: boolean;
          }) => void;
          prompt: (
            notification?: (notification: { isNotDisplayed: () => boolean }) => void
          ) => void;
        };
      };
    };
  }
}

// Generate nonce to use for Google ID token sign-in
const generateNonce = async (): Promise<string[]> => {
  const nonce = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))));
  const encoder = new TextEncoder();
  const encodedNonce = encoder.encode(nonce);
  const hashBuffer = await crypto.subtle.digest('SHA-256', encodedNonce);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashedNonce = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  return [nonce, hashedNonce];
};

interface GoogleOneTapProps {
  /** Redirect path after successful sign-in. Default: '/platform/current' */
  redirectTo?: string;
  /** Whether to auto-select if only one account is available. Default: true */
  autoSelect?: boolean;
  /** Whether to show the One-Tap UI. Set to false if user has explicitly dismissed it. Default: true */
  enabled?: boolean;
}

const GoogleOneTap = ({
  redirectTo = '/platform/current',
  autoSelect = true,
  enabled = true,
}: GoogleOneTapProps) => {
  const supabase = createClient();
  const router = useRouter();
  const [isInitialized, setIsInitialized] = useState(false);

  const initializeGoogleOneTap = async () => {
    if (!enabled || isInitialized) return;

    console.log('Initializing Google One Tap');
    const [nonce, hashedNonce] = await generateNonce();

    // Check if there's already an existing session before initializing the one-tap UI
    const { data, error } = await supabase.auth.getSession();
    if (error) {
      console.error('Error getting session', error);
    }
    if (data.session) {
      // User is already logged in
      return;
    }

    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    if (!clientId) {
      console.error('NEXT_PUBLIC_GOOGLE_CLIENT_ID is not set');
      return;
    }

    if (!window.google) {
      console.error('Google One Tap library not loaded');
      return;
    }

    window.google.accounts.id.initialize({
      client_id: clientId,
      callback: async (response: CredentialResponse) => {
        try {
          console.log('Google One Tap: received credential');
          // Send ID token returned in response.credential to Supabase
          const { data, error } = await supabase.auth.signInWithIdToken({
            provider: 'google',
            token: response.credential,
            nonce,
          });

          if (error) throw error;

          console.log('Successfully logged in with Google One Tap');

          // Redirect to protected page
          router.push(redirectTo);
          router.refresh();
        } catch (error) {
          console.error('Error logging in with Google One Tap', error);
        }
      },
      nonce: hashedNonce,
      // With Chrome's removal of third-party cookies, we need to use FedCM instead
      use_fedcm_for_prompt: true,
      auto_select: autoSelect,
      cancel_on_tap_outside: false,
    });

    window.google.accounts.id.prompt((notification) => {
      if (notification.isNotDisplayed()) {
        console.log('Google One Tap was not displayed');
      }
    });

    setIsInitialized(true);
  };

  useEffect(() => {
    // Reset initialization if enabled changes
    if (!enabled) {
      setIsInitialized(false);
    }
  }, [enabled]);

  if (!enabled) return null;

  return <Script onReady={initializeGoogleOneTap} src="https://accounts.google.com/gsi/client" />;
};

export default GoogleOneTap;

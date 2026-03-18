"use client";

const getLocationSnapshot = () =>
  `${window.location.pathname}${window.location.search}${window.location.hash}`;

export const navigateWithFallback = (
  navigate: (href: string) => void,
  href: string,
  timeoutMs = 1200
) => {
  if (typeof window === "undefined") {
    navigate(href);
    return;
  }

  const startLocation = getLocationSnapshot();
  navigate(href);

  window.setTimeout(() => {
    const currentLocation = getLocationSnapshot();
    if (currentLocation === startLocation) {
      window.location.assign(href);
    }
  }, timeoutMs);
};

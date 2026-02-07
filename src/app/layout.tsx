import type { Metadata } from "next";
import Providers from "./providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "AITrader - AI-Powered Stock Analysis",
  description:
    "Research-backed AI that outperforms human traders with scientifically-proven stock analysis.",
  openGraph: {
    title: "AITrader - AI-Powered Stock Analysis",
    description:
      "Research-backed AI that outperforms human traders with scientifically-proven stock analysis.",
    images: ["/og-image.png"],
  },
};

const RootLayout = ({ children }: { children: React.ReactNode }) => {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
};

export default RootLayout;

"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Home } from "lucide-react";

const NotFoundPage = () => {
  const pathname = usePathname();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", pathname);
  }, [pathname]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="max-w-md text-center p-8 bg-white rounded-xl shadow-soft">
        <h1 className="text-5xl font-bold text-gray-900 mb-4">404</h1>
        <p className="text-xl text-gray-600 mb-6">Page not found</p>
        <p className="text-gray-500 mb-8">
          It looks like you&apos;ve tried to access{" "}
          <strong>{pathname}</strong> directly.
        </p>
        <Link href="/">
          <Button className="rounded-xl px-5 transition-all duration-300 bg-trader-blue hover:bg-trader-blue-dark">
            <Home size={18} className="mr-2" />
            <span>Return to Home</span>
          </Button>
        </Link>
      </div>
    </div>
  );
};

export default NotFoundPage;

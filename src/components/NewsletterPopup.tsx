"use client";

import React, { useState, useEffect, forwardRef, useImperativeHandle } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Mail, Loader2 } from "lucide-react";
import { errorHandler, asyncErrorHandler } from "@/lib/errorHandler";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/utils/supabase/browser";

// Define the ref type for external control
export interface NewsletterPopupRef {
  openPopup: () => void;
}

const NewsletterPopup = forwardRef<NewsletterPopupRef, object>((props, ref) => {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Expose the openPopup method to parent components
  useImperativeHandle(ref, () => ({
    openPopup: () => {
      setOpen(true);
    }
  }));

  useEffect(() => {
    // Show popup after 10 seconds
    const timer = setTimeout(() => {
      errorHandler(() => {
        // Check if user has already subscribed (using localStorage)
        const hasSubscribed = localStorage.getItem("newsletter_subscribed");
        if (!hasSubscribed) {
          setOpen(true);
        }
      }, (err) => {
        console.error("Failed to check subscription status:", err.message);
      });
    }, 10000);

    return () => clearTimeout(timer);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Simple email validation
    if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
      setError("Please enter a valid email address");
      return;
    }
    
    setIsSubmitting(true);
    
    await asyncErrorHandler(async () => {
      if (!isSupabaseConfigured()) {
        throw new Error("Supabase is not configured. Please try again later.");
      }

      const supabase = getSupabaseBrowserClient();
      if (!supabase) {
        throw new Error("Supabase client unavailable.");
      }

      const { error: insertError } = await supabase
        .from("newsletter_subscribers")
        .upsert(
          {
            email,
            source: "popup",
            status: "subscribed",
          },
          { onConflict: "email" }
        );

      if (insertError) {
        throw new Error(insertError.message);
      }

      // Mark as subscribed in localStorage
      localStorage.setItem("newsletter_subscribed", "true");
      
      // Show success message
      setIsSubmitted(true);
      
      // Close dialog after 2 seconds
      setTimeout(() => {
        setOpen(false);
        // Reset form state after closing
        setTimeout(() => {
          setIsSubmitted(false);
          setEmail("");
        }, 300);
      }, 2000);
    }, (err) => {
      setError("Failed to subscribe: " + err.message);
    });
    
    setIsSubmitting(false);
  };

  const handleEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setEmail(e.target.value);
    setError("");
  };

  const handleClose = () => {
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">
            Subscribe to AI Trader Newsletter
          </DialogTitle>
          <DialogDescription className="text-base mt-2">
            Get weekly reports and updates on the latest trendy stocks suggested by AI Trader. 
            It's completely free!
          </DialogDescription>
        </DialogHeader>
        
        {!isSubmitted ? (
          <form 
            onSubmit={handleSubmit} 
            className="space-y-4 py-4"
          >
            <div className="space-y-2">
              <Input
                id="email"
                name="email"
                type="email"
                placeholder="Enter your email"
                value={email}
                onChange={handleEmailChange}
                className="w-full"
                required
              />
              {error && <p className="text-sm text-red-500">{error}</p>}
            </div>
            
            <DialogFooter className="flex flex-col sm:flex-row sm:justify-between sm:space-x-2 pt-2">
              <Button 
                type="button" 
                variant="outline" 
                onClick={handleClose}
                className="mb-2 sm:mb-0"
                disabled={isSubmitting}
              >
                Maybe later
              </Button>
              <Button 
                type="submit" 
                className="w-full sm:w-auto"
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Subscribing...
                  </>
                ) : (
                  <>
                    <Mail className="mr-2" />
                    Subscribe Now
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        ) : (
          <div className="py-6 text-center">
            <div className="rounded-full bg-green-100 dark:bg-green-900/40 p-3 w-12 h-12 mx-auto flex items-center justify-center mb-4">
              <svg 
                xmlns="http://www.w3.org/2000/svg" 
                className="h-6 w-6 text-green-600" 
                fill="none" 
                viewBox="0 0 24 24" 
                stroke="currentColor"
              >
                <path 
                  strokeLinecap="round" 
                  strokeLinejoin="round" 
                  strokeWidth={2} 
                  d="M5 13l4 4L19 7" 
                />
              </svg>
            </div>
            <h3 className="text-lg font-medium text-foreground">Thanks for subscribing!</h3>
            <p className="text-muted-foreground mt-1">
              You'll receive our weekly updates on the latest stock trends.
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
});

NewsletterPopup.displayName = "NewsletterPopup";

export default NewsletterPopup; 
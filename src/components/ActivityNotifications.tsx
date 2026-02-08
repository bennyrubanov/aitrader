'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { User, TrendingUp, Clock, X, ArrowUp, ArrowDown } from 'lucide-react';
import { errorHandler, asyncErrorHandler } from '@/lib/errorHandler';

type StockInfo = {
  symbol: string;
  name: string;
  trend: 'up' | 'down';
  percentage: string;
};

type Notification = {
  id: number;
  stock: StockInfo;
  location: string;
  timeAgo: number;
  action: string;
  insight: string | null;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isString = (value: unknown): value is string => typeof value === 'string';

// List of popular stocks for randomization with additional data
const STOCKS: StockInfo[] = [
  { symbol: 'AAPL', name: 'Apple Inc.', trend: 'up', percentage: '2.4%' },
  { symbol: 'MSFT', name: 'Microsoft Corp.', trend: 'up', percentage: '1.8%' },
  { symbol: 'GOOGL', name: 'Alphabet Inc.', trend: 'up', percentage: '3.2%' },
  { symbol: 'AMZN', name: 'Amazon.com Inc.', trend: 'down', percentage: '0.7%' },
  { symbol: 'META', name: 'Meta Platforms Inc.', trend: 'up', percentage: '4.1%' },
  { symbol: 'TSLA', name: 'Tesla Inc.', trend: 'up', percentage: '5.3%' },
  { symbol: 'NVDA', name: 'NVIDIA Corp.', trend: 'up', percentage: '6.2%' },
  { symbol: 'AMD', name: 'Advanced Micro Devices', trend: 'down', percentage: '1.3%' },
  { symbol: 'DIS', name: 'Walt Disney Co.', trend: 'up', percentage: '1.5%' },
  { symbol: 'NFLX', name: 'Netflix Inc.', trend: 'up', percentage: '2.7%' },
  { symbol: 'PYPL', name: 'PayPal Holdings Inc.', trend: 'down', percentage: '0.9%' },
  { symbol: 'INTC', name: 'Intel Corp.', trend: 'down', percentage: '1.1%' },
  { symbol: 'ADBE', name: 'Adobe Inc.', trend: 'up', percentage: '1.9%' },
  { symbol: 'CRM', name: 'Salesforce Inc.', trend: 'up', percentage: '2.2%' },
  { symbol: 'SBUX', name: 'Starbucks Corp.', trend: 'down', percentage: '0.5%' },
];

// Fallback locations in case API fails
const FALLBACK_LOCATIONS = [
  'New York',
  'San Francisco',
  'London',
  'Tokyo',
  'Singapore',
  'Sydney',
  'Berlin',
  'Toronto',
  'Paris',
  'Mumbai',
  'Hong Kong',
  'Chicago',
  'Los Angeles',
  'Seattle',
  'Boston',
];

// Random Data API endpoint for addresses
const RANDOM_ADDRESS_API = 'https://random-data-api.com/api/v2/addresses?size=10';

// List of user actions - focused only on report generation and analysis
const ACTIONS = [
  'just analyzed',
  'generated a report on',
  'is researching',
  'is reviewing',
  'created an analysis for',
  'is examining trends for',
  'requested data on',
  'is studying performance of',
];

// List of insights for more engaging content - removed buy/sell signals
const INSIGHTS = [
  'Historical pattern analysis',
  'Trend identification',
  'Volume analysis',
  'Market correlation',
  'Volatility assessment',
  'Sector comparison',
  'Performance metrics',
  'Technical indicators',
  'Fundamental analysis',
  'Industry positioning',
];

// Configuration for timing
const NOTIFICATION_CONFIG = {
  // How long notifications stay on screen (in milliseconds)
  displayDuration: 8000,
  // Initial delay before first notification
  initialDelay: 5000,
  // Minimum delay between notifications
  minDelay: 5000,
  // Maximum additional random delay between notifications
  maxRandomDelay: 15000,
};

// Generate a random time between 5 seconds and 2 minutes ago
const getRandomTime = () => {
  const seconds = Math.floor(Math.random() * 115) + 5; // 5 to 120 seconds
  return seconds;
};

const ActivityNotifications = () => {
  const [currentNotification, setCurrentNotification] = useState<Notification | null>(null);
  const [locations, setLocations] = useState<string[]>(FALLBACK_LOCATIONS);
  const [isLoadingLocations, setIsLoadingLocations] = useState(true);

  // Fetch random locations from the API
  useEffect(() => {
    const fetchLocations = async () => {
      setIsLoadingLocations(true);

      await asyncErrorHandler(
        async () => {
          const response = await fetch(RANDOM_ADDRESS_API);

          if (!response.ok) {
            throw new Error('Failed to fetch random addresses');
          }

          const data = (await response.json()) as unknown;
          const addresses = Array.isArray(data) ? data : [];

          // Extract cities from the addresses and filter out any empty values
          const cities = addresses
            .map((address) => {
              // Some addresses might have city, some might have state_abbreviation
              // We'll use a combination to get more variety
              if (!isRecord(address)) {
                return null;
              }
              const city = isString(address.city) ? address.city.trim() : '';
              const state = isString(address.state_abbreviation)
                ? address.state_abbreviation.trim()
                : '';
              if (city) {
                return state ? `${city}, ${state}` : city;
              }
              return null;
            })
            .filter((city): city is string => Boolean(city));

          // If we got valid cities, use them; otherwise, fall back to our predefined list
          if (cities.length > 0) {
            setLocations(cities);
          }
        },
        (err) => {
          console.error('Error fetching locations:', err.message);
          // Keep using fallback locations if API fails
        }
      );

      setIsLoadingLocations(false);
    };

    fetchLocations();
  }, []);

  // Generate a random notification
  const generateNotification = useCallback(() => {
    const stock = STOCKS[Math.floor(Math.random() * STOCKS.length)];
    const location = locations[Math.floor(Math.random() * locations.length)];
    const timeAgo = getRandomTime();
    const action = ACTIONS[Math.floor(Math.random() * ACTIONS.length)];
    const insight =
      Math.random() > 0.5 ? INSIGHTS[Math.floor(Math.random() * INSIGHTS.length)] : null;

    return {
      id: Date.now(),
      stock,
      location,
      timeAgo,
      action,
      insight,
    };
  }, [locations]);

  // Function to dismiss the current notification
  const dismissNotification = useCallback(() => {
    setCurrentNotification(null);
  }, []);

  // Function to add a new notification
  const addNotification = useCallback(() => {
    errorHandler(() => {
      const newNotification = generateNotification();
      setCurrentNotification(newNotification);

      // Auto-dismiss after configured duration
      setTimeout(() => {
        dismissNotification();
      }, NOTIFICATION_CONFIG.displayDuration);
    });
  }, [generateNotification, dismissNotification]);

  useEffect(() => {
    // Initial delay before showing the first notification
    // Wait until locations are loaded
    if (!isLoadingLocations) {
      const initialDelay = setTimeout(() => {
        addNotification();
      }, NOTIFICATION_CONFIG.initialDelay);

      return () => clearTimeout(initialDelay);
    }
  }, [isLoadingLocations, addNotification]);

  useEffect(() => {
    if (!currentNotification && !isLoadingLocations) {
      // Schedule the next notification after a random delay
      const nextDelay =
        Math.floor(Math.random() * NOTIFICATION_CONFIG.maxRandomDelay) +
        NOTIFICATION_CONFIG.minDelay;
      const timer = setTimeout(() => {
        addNotification();
      }, nextDelay);

      return () => clearTimeout(timer);
    }
  }, [currentNotification, isLoadingLocations, addNotification]);

  // Format the time ago text
  const formatTimeAgo = (seconds: number) => {
    if (seconds < 60) {
      return `${seconds} seconds ago`;
    } else {
      const minutes = Math.floor(seconds / 60);
      return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
    }
  };

  if (!currentNotification) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50">
      <AnimatePresence>
        {currentNotification && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.9 }}
            transition={{ type: 'spring', stiffness: 500, damping: 30 }}
            className="bg-white rounded-lg shadow-xl border border-gray-200 p-4 max-w-sm w-full"
          >
            <div className="flex items-start">
              <div className="flex-shrink-0 bg-primary/10 rounded-full p-2">
                <User className="h-6 w-6 text-primary" />
              </div>
              <div className="ml-3 flex-1">
                <div className="flex justify-between items-start">
                  <p className="text-sm font-medium text-gray-900">
                    Someone from {currentNotification.location}
                  </p>
                  <button
                    onClick={dismissNotification}
                    className="ml-4 text-gray-400 hover:text-gray-500"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <p className="mt-1 text-sm text-gray-600">
                  {currentNotification.action}{' '}
                  <span className="font-semibold text-primary">
                    {currentNotification.stock.symbol}
                  </span>{' '}
                  ({currentNotification.stock.name})
                </p>

                {/* Stock trend indicator */}
                <div className="mt-2 flex items-center">
                  <div
                    className={`flex items-center text-xs ${
                      currentNotification.stock.trend === 'up' ? 'text-green-600' : 'text-red-600'
                    }`}
                  >
                    {currentNotification.stock.trend === 'up' ? (
                      <ArrowUp className="h-3 w-3 mr-1" />
                    ) : (
                      <ArrowDown className="h-3 w-3 mr-1" />
                    )}
                    <span className="font-medium">{currentNotification.stock.percentage}</span>
                  </div>

                  {currentNotification.insight && (
                    <span className="ml-2 text-xs bg-yellow-100 text-yellow-800 px-1.5 py-0.5 rounded-full">
                      {currentNotification.insight}
                    </span>
                  )}
                </div>

                <div className="mt-2 flex items-center text-xs text-gray-500">
                  <Clock className="mr-1 h-3 w-3" />
                  {formatTimeAgo(currentNotification.timeAgo)}
                  <TrendingUp className="ml-3 mr-1 h-3 w-3 text-green-500" />
                  AI-powered analysis
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default ActivityNotifications;

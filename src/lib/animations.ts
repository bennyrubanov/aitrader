"use client";

import { useEffect, useState, useRef, RefObject } from 'react';

export function useIsVisible(ref: RefObject<HTMLElement>): boolean {
  const [isIntersecting, setIntersecting] = useState<boolean>(false);

  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => {
      setIntersecting(entry.isIntersecting);
    }, {
      rootMargin: '0px',
      threshold: 0.1
    });

    const currentRef = ref.current;
    if (currentRef) {
      observer.observe(currentRef);
    }

    return () => {
      if (currentRef) {
        observer.unobserve(currentRef);
      }
    };
  }, [ref]);

  return isIntersecting;
}

export function useAnimatedCounter(
  targetValue: number,
  duration: number = 2000,
  startOnVisible: boolean = true
): { value: number; ref?: RefObject<HTMLDivElement> } {
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const isVisible = useIsVisible(ref);
  const [hasAnimated, setHasAnimated] = useState(false);

  useEffect(() => {
    if ((startOnVisible && isVisible && !hasAnimated) || (!startOnVisible && !hasAnimated)) {
      setHasAnimated(true);
      
      const startTime = Date.now();
      const endTime = startTime + duration;
      
      const updateCount = () => {
        const now = Date.now();
        const progress = Math.min(1, (now - startTime) / duration);
        
        // Easing function: easeOutQuart
        const easedProgress = 1 - Math.pow(1 - progress, 4);
        
        setCount(Math.floor(easedProgress * targetValue));
        
        if (now < endTime) {
          requestAnimationFrame(updateCount);
        } else {
          setCount(targetValue);
        }
      };
      
      requestAnimationFrame(updateCount);
    }
  }, [isVisible, targetValue, duration, startOnVisible, hasAnimated]);
  
  return { value: count };
}

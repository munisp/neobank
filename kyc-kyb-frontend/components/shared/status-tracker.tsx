/**
 * Status Tracker Component
 * Visual progress tracker for KYC/KYB applications
 */

'use client';

import * as React from 'react';
import { CheckCircle2, Circle, Clock } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

export interface Step {
  id: string;
  title: string;
  description?: string;
  status: 'completed' | 'current' | 'upcoming';
}

export interface StatusTrackerProps {
  steps: Step[];
  className?: string;
}

export function StatusTracker({ steps, className }: StatusTrackerProps) {
  return (
    <div className={cn('w-full', className)}>
      <nav aria-label="Progress">
        <ol role="list" className="space-y-4 md:flex md:space-y-0 md:space-x-8">
          {steps.map((step, stepIdx) => (
            <li key={step.id} className="md:flex-1">
              <div
                className={cn(
                  'group flex flex-col border-l-4 py-2 pl-4 md:border-l-0 md:border-t-4 md:pl-0 md:pt-4 md:pb-0',
                  step.status === 'completed'
                    ? 'border-primary'
                    : step.status === 'current'
                    ? 'border-primary'
                    : 'border-gray-200'
                )}
              >
                <span className="flex items-center text-sm font-medium">
                  {step.status === 'completed' ? (
                    <CheckCircle2 className="h-5 w-5 text-primary mr-2 flex-shrink-0" />
                  ) : step.status === 'current' ? (
                    <Clock className="h-5 w-5 text-primary mr-2 flex-shrink-0 animate-pulse" />
                  ) : (
                    <Circle className="h-5 w-5 text-gray-400 mr-2 flex-shrink-0" />
                  )}
                  <span
                    className={cn(
                      step.status === 'completed' || step.status === 'current'
                        ? 'text-primary'
                        : 'text-gray-500'
                    )}
                  >
                    {step.title}
                  </span>
                </span>
                {step.description && (
                  <span className="mt-1 text-sm text-gray-500 ml-7 md:ml-0">
                    {step.description}
                  </span>
                )}
              </div>
            </li>
          ))}
        </ol>
      </nav>
    </div>
  );
}

export default StatusTracker;

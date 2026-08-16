import React from 'react';
import { BookingWizard } from '../components/customer/BookingWizard';
import { Scissors, Sparkles } from 'lucide-react';

export default function BookingPage() {
  return (
    <div className="py-8">
      {/* Background Decors */}
      <div className="absolute top-20 right-10 w-72 h-72 bg-amber-500/5 rounded-full blur-3xl pointer-events-none" />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <BookingWizard />
      </div>
    </div>
  );
}

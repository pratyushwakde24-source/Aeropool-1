import React, { useState } from 'react';
import { ArrowLeft, ChevronDown, ChevronUp, HelpCircle } from 'lucide-react';

interface FaqViewProps {
  onNavigate: (route: string) => void;
}

export const FaqView: React.FC<FaqViewProps> = ({ onNavigate }) => {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  const faqs = [
    {
      q: 'How does AeroPool guarantee that I will not be delayed?',
      a: 'AeroPool groups only passengers arriving within a 15-minute window and traveling along the same corridor. The matching algorithm enforces a maximum detour threshold of 20 minutes. If no compatible match is available, you will be notified immediately.',
    },
    {
      q: 'Where do I meet my driver at CSMIA Mumbai?',
      a: 'At Terminal 2 (T2), our primary hub is located at Level P4 East (Pillars 4–6), with an alternate hub at Level P7 MLCP. At Terminal 1 (T1), our pickup zone is at the Domestic Arrival Curbside (Pillars 3–4). Your booking screen displays exact walking directions and live vehicle status.',
    },
    {
      q: 'How does fare splitting work?',
      a: 'The fare is calculated on the total route distance, duration, and airport tolls. By sharing the ride with 1 or 2 co-passengers, each person pays up to 40% less than an individual private taxi. Fares are computed transparently in integer paise.',
    },
    {
      q: 'What if my flight arrives late?',
      a: 'AeroPool integrates with CSMIA airport flight tracking. If your incoming flight is delayed, our system automatically adjusts your pickup window and matches you with a subsequent departure pool without any cancellation penalty.',
    },
    {
      q: 'What is the luggage allowance per passenger?',
      a: 'Each passenger seat booking includes 1 large check-in suitcase (up to 23 kg) and 1 carry-on backpack. If you have extra bags, you can select the additional luggage option during booking.',
    },
    {
      q: 'What is the cancellation and refund policy?',
      a: 'You can cancel free of charge any time up to 15 minutes prior to your scheduled pickup window. Refunds are processed automatically back to your original payment method.',
    },
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto space-y-8">
        <button
          onClick={() => onNavigate('/')}
          className="inline-flex items-center gap-2 text-xs font-semibold text-slate-400 hover:text-white transition"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Home</span>
        </button>

        <div>
          <span className="text-xs font-mono font-bold text-sky-400 uppercase tracking-widest">
            Help & Knowledgebase
          </span>
          <h1 className="text-3xl font-extrabold text-white mt-1">Frequently Asked Questions</h1>
          <p className="text-slate-400 text-sm mt-2">
            Detailed answers regarding flight matching, airport terminals, fares, and safety.
          </p>
        </div>

        <div className="space-y-3">
          {faqs.map((faq, idx) => {
            const isOpen = openIndex === idx;
            return (
              <div
                key={idx}
                className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden transition"
              >
                <button
                  onClick={() => setOpenIndex(isOpen ? null : idx)}
                  className="w-full p-4 text-left flex items-center justify-between text-xs font-semibold text-white hover:text-sky-400 transition"
                >
                  <span>{faq.q}</span>
                  {isOpen ? <ChevronUp className="w-4 h-4 text-sky-400 shrink-0" /> : <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />}
                </button>
                {isOpen && (
                  <div className="px-4 pb-4 text-xs text-slate-300 leading-relaxed border-t border-slate-800/60 pt-3">
                    {faq.a}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

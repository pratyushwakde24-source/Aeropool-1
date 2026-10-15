import React, { useState } from 'react';
import { ArrowLeft, Clock, MapPin, Download, CheckCircle2, XCircle, ArrowRight, FileText, Printer } from 'lucide-react';
import { db } from '../services/db';
import { formatINR } from '../services/pricingEngine';
import { Booking } from '../types';

interface PassengerBookingsViewProps {
  onNavigate: (route: string) => void;
  onSelectBooking: (bookingId: string) => void;
}

export const PassengerBookingsView: React.FC<PassengerBookingsViewProps> = ({
  onNavigate,
  onSelectBooking,
}) => {
  const [selectedInvoice, setSelectedInvoice] = useState<Booking | null>(null);

  const currentUser = db.getState().currentUser;
  const bookings = db.getBookingsForUser(currentUser.id, currentUser.role);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Top Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">My Airport Bookings</h1>
            <p className="text-xs text-slate-400 mt-1">
              Active rides, past trip history, and official GST tax invoices.
            </p>
          </div>
          <button
            onClick={() => onNavigate('/app/book')}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-xl shadow-lg transition flex items-center gap-1.5"
          >
            <span>Book New Ride</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>

        {/* Bookings List */}
        {bookings.length === 0 ? (
          <div className="p-12 text-center bg-slate-900 border border-slate-800 rounded-2xl space-y-3">
            <Clock className="w-10 h-10 text-slate-500 mx-auto" />
            <h3 className="text-sm font-bold text-white">No Airport Bookings Yet</h3>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              You haven't booked any rides from CSMIA Mumbai yet. Book your first pooled ride to start saving.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {bookings.map((booking) => {
              const isActive =
                booking.bookingStatus !== 'COMPLETED' && booking.bookingStatus !== 'CANCELLED';
              return (
                <div
                  key={booking.id}
                  className={`p-5 bg-slate-900 border rounded-2xl transition space-y-4 ${
                    isActive ? 'border-sky-500/40 shadow-lg shadow-sky-500/5' : 'border-slate-800'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-800">
                    <div className="flex items-center gap-2.5">
                      <span className="text-sm font-bold text-white font-mono">
                        Flight {booking.flightNumber}
                      </span>
                      <span
                        className={`text-[10px] font-mono px-2.5 py-0.5 rounded font-bold uppercase ${
                          booking.bookingStatus === 'CANCELLED'
                            ? 'bg-red-500/10 text-red-400 border border-red-500/20'
                            : booking.bookingStatus === 'COMPLETED'
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                            : 'bg-sky-500/10 text-sky-400 border border-sky-500/20 animate-pulse'
                        }`}
                      >
                        {booking.bookingStatus.replace(/_/g, ' ')}
                      </span>
                    </div>

                    <div className="text-xs font-mono text-slate-400">
                      Booked {new Date(booking.createdAt).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                    <div>
                      <div className="text-slate-400 text-[11px]">CSMIA Terminal & Pickup</div>
                      <div className="text-slate-200 font-semibold">{booking.pickupZoneName}</div>
                      <div className="text-[11px] text-sky-400 font-mono mt-0.5">OTP: {booking.pickupOtp}</div>
                    </div>

                    <div>
                      <div className="text-slate-400 text-[11px]">Drop-Off Destination</div>
                      <div className="text-slate-200 font-semibold">{booking.destination.name}</div>
                      <div className="text-[11px] text-slate-400">{booking.destination.corridor}</div>
                    </div>

                    <div className="sm:text-right">
                      <div className="text-slate-400 text-[11px]">Paid Fare (Incl. GST)</div>
                      <div className="text-base font-bold text-white font-mono">{formatINR(booking.farePaise)}</div>
                      <div className="text-[11px] text-emerald-400 font-semibold">
                        Saved {formatINR(booking.savingsPaise)} vs solo
                      </div>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-800 flex items-center justify-between">
                    <button
                      onClick={() => setSelectedInvoice(booking)}
                      className="text-xs text-slate-400 hover:text-white flex items-center gap-1.5 transition"
                    >
                      <FileText className="w-3.5 h-3.5 text-sky-400" />
                      <span>View GST Tax Invoice</span>
                    </button>

                    {isActive && (
                      <button
                        onClick={() => {
                          onSelectBooking(booking.id);
                          onNavigate(`/app/track/${booking.id}`);
                        }}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl shadow-md transition flex items-center gap-1.5"
                      >
                        <span>Live Trip HUD</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Printable Tax Invoice Modal */}
      {selectedInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white text-slate-900 rounded-2xl p-6 sm:p-8 max-w-lg w-full space-y-5 shadow-2xl relative">
            <div className="flex items-center justify-between border-b pb-4">
              <div>
                <h3 className="text-lg font-bold text-slate-900">AeroPool Mobility</h3>
                <p className="text-xs text-slate-500">GSTIN: 27AABCM8291Q1Z4 • CSMIA Mumbai Hub</p>
              </div>
              <button
                onClick={() => setSelectedInvoice(null)}
                className="text-xs font-bold text-slate-500 hover:text-slate-900"
              >
                Close
              </button>
            </div>

            <div className="space-y-1 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">Invoice ID:</span>
                <span className="font-mono font-bold">INV-{selectedInvoice.id.slice(-8).toUpperCase()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Passenger:</span>
                <span className="font-bold">{selectedInvoice.passengerName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Trip Date:</span>
                <span>{new Date(selectedInvoice.createdAt).toLocaleDateString('en-IN')}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Payment ID:</span>
                <span className="font-mono">{selectedInvoice.paymentId}</span>
              </div>
            </div>

            <div className="border-t border-b py-3 space-y-1.5 text-xs">
              <div className="flex justify-between font-semibold">
                <span>Description</span>
                <span>Amount</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Pooled Airport Transit ({selectedInvoice.destination.name})</span>
                <span className="font-mono">{formatINR(selectedInvoice.farePaise - Math.round(selectedInvoice.farePaise * 0.05))}</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>GST (CGST 2.5% + SGST 2.5%)</span>
                <span className="font-mono">{formatINR(Math.round(selectedInvoice.farePaise * 0.05))}</span>
              </div>
              <div className="flex justify-between font-bold text-slate-900 pt-2 border-t">
                <span>Total Paid (INR):</span>
                <span className="font-mono">{formatINR(selectedInvoice.farePaise, true)}</span>
              </div>
            </div>

            <div className="text-[11px] text-slate-400 text-center">
              This is a computer-generated tax invoice for shared passenger mobility.
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => {
                  try {
                    window.print();
                  } catch (e) {
                    console.warn('Print preview blocked in iframe:', e);
                  }
                }}
                className="px-4 py-2 bg-slate-900 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Print / Save PDF</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { normalizeCustomUnitLabelInput } from '@/lib/invoices/invoice-line-units';
import { InvoiceLineUnitField } from '@/components/invoices/InvoiceLineUnitField';

type InvoiceItem = {
  description: string;
  quantity: number;
  unitLabel: string;
  unitPrice: number;
  lineTotal: number;
};

type InvoiceState = {
  clientName: string;
  invoiceNumber: string;
  dueDate: string;
  taxPercent: number;
  notes: string;
  items: InvoiceItem[];
};

type VoiceInvoiceResponse = {
  transcript: string;
  invoice: InvoiceState;
  subtotal: number;
  taxAmount: number;
  total: number;
};

type RecordingState = 'idle' | 'recording' | 'uploading';

const initialInvoice: InvoiceState = {
  clientName: '',
  invoiceNumber: '',
  dueDate: '',
  taxPercent: 0,
  notes: '',
  items: [
    {
      description: '',
      quantity: 1,
      unitLabel: 'item',
      unitPrice: 0,
      lineTotal: 0,
    },
  ],
};

export default function VoiceInvoicePage() {
  const [recordingState, setRecordingState] = useState<RecordingState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<string>('');
  const [invoice, setInvoice] = useState<InvoiceState>(initialInvoice);
  const [serverTotals, setServerTotals] = useState<{
    subtotal: number;
    taxAmount: number;
    total: number;
  } | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const hasItems = invoice.items.length > 0;

  const computedTotals = useMemo(() => {
    const subtotal = invoice.items.reduce(
      (sum, item) => sum + (item.quantity || 0) * (item.unitPrice || 0),
      0
    );
    const taxAmount = subtotal * ((invoice.taxPercent || 0) / 100);
    const total = subtotal + taxAmount;
    return { subtotal, taxAmount, total };
  }, [invoice.items, invoice.taxPercent]);

  useEffect(() => {
    invoice.items.forEach((item, index) => {
      const lineTotal = (item.quantity || 0) * (item.unitPrice || 0);
      if (lineTotal !== item.lineTotal) {
        setInvoice((prev) => {
          const updated = [...prev.items];
          updated[index] = { ...updated[index], lineTotal };
          return { ...prev, items: updated };
        });
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoice.items]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && recordingState === 'recording') {
      mediaRecorderRef.current.stop();
    }
  }, [recordingState]);

  const startRecording = useCallback(async () => {
    try {
      setError(null);
      setTranscript('');
      setServerTotals(null);

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setError('Microphone access is not supported in this browser.');
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        setRecordingState('uploading');
        try {
          const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
          const file = new File([blob], 'invoice-recording.webm', { type: 'audio/webm' });
          const formData = new FormData();
          formData.append('file', file);

          const res = await fetch('/api/voice-invoice', {
            method: 'POST',
            body: formData,
          });

          if (!res.ok) {
            const data = await res.json().catch(() => null);
            const message = data?.error || `Request failed with status ${res.status}`;
            throw new Error(message);
          }

          const data = (await res.json()) as VoiceInvoiceResponse;
          setTranscript(data.transcript);
          setInvoice(data.invoice);
          setServerTotals({
            subtotal: data.subtotal,
            taxAmount: data.taxAmount,
            total: data.total,
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Failed to process audio';
          setError(message);
        } finally {
          setRecordingState('idle');
          stream.getTracks().forEach((track) => track.stop());
        }
      };

      mediaRecorder.start();
      mediaRecorderRef.current = mediaRecorder;
      setRecordingState('recording');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not start recording';
      setError(message);
      setRecordingState('idle');
    }
  }, []);

  const handleMicClick = () => {
    if (recordingState === 'recording') {
      stopRecording();
    } else if (recordingState === 'idle') {
      void startRecording();
    }
  };

  const updateInvoiceField = <K extends keyof InvoiceState>(key: K, value: InvoiceState[K]) => {
    setInvoice((prev) => ({ ...prev, [key]: value }));
  };

  const updateItemField = (index: number, field: keyof InvoiceItem, value: string | number) => {
    setInvoice((prev) => {
      const items = [...prev.items];
      const current = items[index];
      if (!current) return prev;

      if (field === 'quantity' || field === 'unitPrice') {
        const numeric = typeof value === 'number' ? value : parseFloat(value || '0');
        items[index] = { ...current, [field]: Number.isNaN(numeric) ? 0 : numeric };
      } else if (field === 'description') {
        items[index] = { ...current, description: String(value) };
      } else if (field === 'unitLabel') {
        items[index] = { ...current, unitLabel: normalizeCustomUnitLabelInput(String(value)) };
      }

      const lineTotal = (items[index].quantity || 0) * (items[index].unitPrice || 0);
      items[index] = { ...items[index], lineTotal };

      return { ...prev, items };
    });
  };

  const addLineItem = () => {
    setInvoice((prev) => ({
      ...prev,
      items: [
        ...prev.items,
        { description: '', quantity: 1, unitLabel: 'item', unitPrice: 0, lineTotal: 0 },
      ],
    }));
  };

  const removeLineItem = (index: number) => {
    setInvoice((prev) => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== index),
    }));
  };

  const isBusy = recordingState === 'recording' || recordingState === 'uploading';

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 flex flex-col items-center px-4 py-10">
      <div className="w-full max-w-4xl">
        <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">Voice Invoice Creator</h2>
            <p className="text-sm text-slate-400 mt-1">
              Click the microphone, speak your invoice, then review and edit the auto-filled details.
            </p>
          </div>
          <button
            type="button"
            onClick={handleMicClick}
            disabled={recordingState === 'uploading'}
            className={`inline-flex items-center justify-center rounded-full w-14 h-14 border transition-colors shadow-lg
              ${
                recordingState === 'recording'
                  ? 'bg-red-500 border-red-400 hover:bg-red-600'
                  : 'bg-slate-900 border-slate-700 hover:bg-slate-800'
              }
              disabled:opacity-60 disabled:cursor-not-allowed
            `}
            aria-label={recordingState === 'recording' ? 'Stop recording' : 'Start recording'}
          >
            <div
              className={`relative flex items-center justify-center w-7 h-7 rounded-full
                ${
                  recordingState === 'recording'
                    ? 'bg-red-300'
                    : 'bg-slate-200'
                }
              `}
            >
              <span
                className={`block transition-all ${
                  recordingState === 'recording'
                    ? 'w-3 h-3 bg-red-700 rounded-sm'
                    : 'w-3.5 h-5 border-2 border-slate-900 border-t-0 border-b-0 rounded-full relative before:content-[\'\'] before:absolute before:-bottom-1 before:left-1/2 before:-translate-x-1/2 before:w-3 before:h-1 before:border-b-2 before:border-slate-900'
                }`}
              />
              {recordingState === 'recording' && (
                <span className="absolute -inset-1 rounded-full border border-red-300 animate-ping" />
              )}
            </div>
          </button>
        </header>

        <div className="mb-6 flex items-center gap-3 text-sm">
          <span
            className={`inline-flex items-center gap-2 rounded-full px-3 py-1 border text-xs font-medium
              ${
                recordingState === 'recording'
                  ? 'border-red-400 bg-red-950/40 text-red-200'
                  : recordingState === 'uploading'
                  ? 'border-amber-400 bg-amber-950/40 text-amber-200'
                  : 'border-emerald-400 bg-emerald-950/40 text-emerald-200'
              }
            `}
          >
            <span
              className={`inline-flex w-2 h-2 rounded-full ${
                recordingState === 'recording'
                  ? 'bg-red-400 animate-pulse'
                  : recordingState === 'uploading'
                  ? 'bg-amber-300 animate-pulse'
                  : 'bg-emerald-400'
              }`}
            />
            {recordingState === 'recording'
              ? 'Recording… speak your invoice'
              : recordingState === 'uploading'
              ? 'Understanding your request…'
              : 'Ready to record'}
          </span>
          {isBusy && (
            <span className="text-xs text-slate-400">
              Please keep this tab open while we process your audio.
            </span>
          )}
        </div>

        {error && (
          <div className="mb-6 rounded-md border border-red-500/60 bg-red-950/40 px-4 py-3 text-sm text-red-100">
            {error}
          </div>
        )}

        <div className="grid gap-6 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1.5fr)]">
          <section className="rounded-lg border border-slate-800 bg-slate-900/60 p-4 md:p-5">
            <h3 className="text-sm font-semibold text-slate-200 mb-2">Transcript</h3>
            <p className="text-xs text-slate-500 mb-3">
              After recording, we&apos;ll show the raw transcript here so you can verify what was heard.
            </p>
            <div className="min-h-[120px] rounded-md bg-slate-950/60 border border-slate-800 px-3 py-2 text-sm text-slate-100 overflow-auto">
              {transcript ? (
                <p className="whitespace-pre-wrap leading-relaxed">{transcript}</p>
              ) : (
                <p className="text-slate-500">
                  No transcript yet. Click the microphone and say something like:{' '}
                  <span className="italic text-slate-300">
                    &quot;Invoice John for 3 logo designs at 120 dollars each, plus 10 percent tax, due
                    next Friday.&quot;
                  </span>
                </p>
              )}
            </div>

            {serverTotals && (
              <div className="mt-4 rounded-md bg-slate-950/70 border border-slate-800 px-3 py-2 text-xs text-slate-400">
                <p className="mb-1 font-medium text-slate-200">AI suggested totals</p>
                <p>Subtotal: ${serverTotals.subtotal.toFixed(2)}</p>
                <p>Tax: ${serverTotals.taxAmount.toFixed(2)}</p>
                <p>Total: ${serverTotals.total.toFixed(2)}</p>
                <p className="mt-1">
                  You can still edit all fields on the right. The numbers will update automatically.
                </p>
              </div>
            )}
          </section>

          <section className="rounded-lg border border-slate-800 bg-slate-900/60 p-4 md:p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-semibold text-slate-200">Invoice preview</h3>
                <p className="text-xs text-slate-500">
                  Fully editable. Adjust anything the AI didn&apos;t get quite right.
                </p>
              </div>
            </div>

            <div className="space-y-3 mb-4">
              <div className="flex flex-col sm:flex-row gap-3">
                <label className="flex-1 text-xs text-slate-400">
                  Client name
                  <input
                    type="text"
                    className="mt-1 w-full rounded-md border border-slate-800 bg-slate-950/80 px-2.5 py-1.5 text-sm text-slate-50 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500"
                    placeholder="John"
                    value={invoice.clientName}
                    onChange={(e) => updateInvoiceField('clientName', e.target.value)}
                  />
                </label>
                <label className="w-full sm:w-40 text-xs text-slate-400">
                  Invoice #
                  <input
                    type="text"
                    className="mt-1 w-full rounded-md border border-slate-800 bg-slate-950/80 px-2.5 py-1.5 text-sm text-slate-50 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500"
                    placeholder="INV-001"
                    value={invoice.invoiceNumber}
                    onChange={(e) => updateInvoiceField('invoiceNumber', e.target.value)}
                  />
                </label>
              </div>

              <div className="flex flex-col sm:flex-row gap-3">
                <label className="flex-1 text-xs text-slate-400">
                  Due date
                  <input
                    type="text"
                    className="mt-1 w-full rounded-md border border-slate-800 bg-slate-950/80 px-2.5 py-1.5 text-sm text-slate-50 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500"
                    placeholder="Next Friday or 2026-03-21"
                    value={invoice.dueDate}
                    onChange={(e) => updateInvoiceField('dueDate', e.target.value)}
                  />
                </label>
                <label className="w-full sm:w-32 text-xs text-slate-400">
                  Tax %
                  <input
                    type="number"
                    min={0}
                    max={100}
                    className="mt-1 w-full rounded-md border border-slate-800 bg-slate-950/80 px-2.5 py-1.5 text-sm text-slate-50 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500"
                    value={invoice.taxPercent}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value || '0');
                      updateInvoiceField('taxPercent', Number.isNaN(v) ? 0 : v);
                    }}
                  />
                </label>
              </div>

              <label className="text-xs text-slate-400 block">
                Notes
                <textarea
                  className="mt-1 w-full rounded-md border border-slate-800 bg-slate-950/80 px-2.5 py-1.5 text-sm text-slate-50 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 min-h-[60px] resize-y"
                  placeholder="Optional notes or payment instructions"
                  value={invoice.notes}
                  onChange={(e) => updateInvoiceField('notes', e.target.value)}
                />
              </label>
            </div>

            <div className="rounded-md border border-slate-800 overflow-hidden mb-4">
              <table className="w-full text-xs">
                <thead className="bg-slate-950/60 border-b border-slate-800">
                  <tr className="text-slate-400">
                    <th className="px-3 py-2 text-left font-medium">Description</th>
                    <th className="px-3 py-2 text-right font-medium w-16">Qty</th>
                    <th className="px-3 py-2 text-left font-medium w-24">Unit</th>
                    <th className="px-3 py-2 text-right font-medium w-24">Rate</th>
                    <th className="px-3 py-2 text-right font-medium w-24">Amount</th>
                    <th className="px-2 py-2 w-8" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {hasItems ? (
                    invoice.items.map((item, index) => (
                      <tr key={index} className="bg-slate-950/40">
                        <td className="px-3 py-1.5 align-top">
                          <input
                            type="text"
                            className="w-full rounded-md border border-slate-800 bg-slate-950/80 px-2 py-1 text-xs text-slate-50 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500"
                            placeholder="Logo design"
                            value={item.description}
                            onChange={(e) =>
                              updateItemField(index, 'description', e.target.value)
                            }
                          />
                        </td>
                        <td className="px-3 py-1.5 align-top">
                          <input
                            type="number"
                            min={0}
                            className="w-full rounded-md border border-slate-800 bg-slate-950/80 px-2 py-1 text-right text-xs text-slate-50 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500"
                            value={item.quantity}
                            onChange={(e) =>
                              updateItemField(index, 'quantity', e.target.value)
                            }
                          />
                        </td>
                        <td className="px-3 py-1.5 align-top">
                          <InvoiceLineUnitField
                            id={`voice-inv-unit-${index}`}
                            variant="voice"
                            unitLabel={item.unitLabel}
                            onChange={(next) => updateItemField(index, 'unitLabel', next)}
                          />
                        </td>
                        <td className="px-3 py-1.5 align-top">
                          <input
                            type="number"
                            min={0}
                            className="w-full rounded-md border border-slate-800 bg-slate-950/80 px-2 py-1 text-right text-xs text-slate-50 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500"
                            value={item.unitPrice}
                            onChange={(e) =>
                              updateItemField(index, 'unitPrice', e.target.value)
                            }
                          />
                        </td>
                        <td className="px-3 py-1.5 align-top text-right text-slate-100">
                          ${item.lineTotal.toFixed(2)}
                        </td>
                        <td className="px-2 py-1.5 align-top text-right">
                          {invoice.items.length > 1 && (
                            <button
                              type="button"
                              onClick={() => removeLineItem(index)}
                              className="text-slate-500 hover:text-red-400 transition-colors"
                              aria-label="Remove line item"
                            >
                              ×
                            </button>
                          )}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td
                        colSpan={6}
                        className="px-3 py-3 text-center text-slate-500 bg-slate-950/40"
                      >
                        No items. Use the button below to add your first line item.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex items-start justify-between gap-4">
              <button
                type="button"
                onClick={addLineItem}
                className="inline-flex items-center rounded-md border border-slate-700 bg-slate-950/70 px-3 py-1.5 text-xs font-medium text-slate-100 hover:bg-slate-900 transition-colors"
              >
                + Add line item
              </button>

              <div className="space-y-1 text-xs min-w-[180px]">
                <div className="flex justify-between text-slate-300">
                  <span>Subtotal</span>
                  <span>${computedTotals.subtotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Tax ({invoice.taxPercent || 0}%)</span>
                  <span>${computedTotals.taxAmount.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-slate-100 font-semibold pt-1 border-t border-slate-800 mt-1">
                  <span>Total</span>
                  <span>${computedTotals.total.toFixed(2)}</span>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}


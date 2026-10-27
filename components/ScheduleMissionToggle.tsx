"use client";

import React, { useState, useEffect } from "react";
import { Calendar, Clock, AlertCircle } from "lucide-react";

interface ScheduleMissionToggleProps {
  value: string | null; // ISO string or null
  onChange: (scheduledAtIso: string | null) => void;
  disabled?: boolean;
}

export default function ScheduleMissionToggle({
  value,
  onChange,
  disabled = false,
}: ScheduleMissionToggleProps) {
  const [enabled, setEnabled] = useState(Boolean(value));
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Initialisation à partir de value si fourni
  useEffect(() => {
    if (value) {
      const d = new Date(value);
      if (!isNaN(d.getTime())) {
        setEnabled(true);
        // Format YYYY-MM-DD
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, "0");
        const day = String(d.getDate()).padStart(2, "0");
        setDate(`${year}-${month}-${day}`);
        // Format HH:MM
        const hours = String(d.getHours()).padStart(2, "0");
        const minutes = String(d.getMinutes()).padStart(2, "0");
        setTime(`${hours}:${minutes}`);
      }
    }
  }, [value]);

  const handleToggle = (checked: boolean) => {
    setEnabled(checked);
    setError(null);
    if (!checked) {
      onChange(null);
    } else {
      // Pré-remplir avec "dans 3 heures" par défaut
      const defaultDate = new Date(Date.now() + 3 * 60 * 60 * 1000);
      const year = defaultDate.getFullYear();
      const month = String(defaultDate.getMonth() + 1).padStart(2, "0");
      const day = String(defaultDate.getDate()).padStart(2, "0");
      const hours = String(defaultDate.getHours()).padStart(2, "0");
      const minutes = "00";

      const dStr = `${year}-${month}-${day}`;
      const tStr = `${hours}:${minutes}`;
      setDate(dStr);
      setTime(tStr);

      const combined = new Date(`${dStr}T${tStr}:00`);
      onChange(combined.toISOString());
    }
  };

  const handleDateTimeChange = (newDate: string, newTime: string) => {
    setDate(newDate);
    setTime(newTime);
    setError(null);

    if (!newDate || !newTime) {
      onChange(null);
      return;
    }

    try {
      const combined = new Date(`${newDate}T${newTime}:00`);
      if (isNaN(combined.getTime())) {
        setError("Format de date invalide.");
        onChange(null);
        return;
      }

      const diffMs = combined.getTime() - Date.now();
      const twoHoursMs = 2 * 60 * 60 * 1000;

      if (diffMs < twoHoursMs - 1000) {
        setError("La livraison doit être programmée au moins 2 heures à l'avance.");
      } else {
        setError(null);
      }

      onChange(combined.toISOString());
    } catch {
      setError("Erreur de sélection de date.");
      onChange(null);
    }
  };

  const setQuickPreset = (hoursFromNow: number) => {
    const target = new Date(Date.now() + hoursFromNow * 60 * 60 * 1000);
    const year = target.getFullYear();
    const month = String(target.getMonth() + 1).padStart(2, "0");
    const day = String(target.getDate()).padStart(2, "0");
    const hours = String(target.getHours()).padStart(2, "0");
    const minutes = "00";

    const dStr = `${year}-${month}-${day}`;
    const tStr = `${hours}:${minutes}`;
    handleDateTimeChange(dStr, tStr);
  };

  // Date minimale pour l'attribut HTML min
  const todayStr = new Date().toISOString().split("T")[0];

  return (
    <div className="space-y-3 rounded-2xl border border-slate-800 bg-slate-900 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-secondary/15 text-secondary">
            <Calendar className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-bold text-slate-50">
              Programmer pour plus tard
            </p>
            <p className="text-xs text-slate-400">
              Réservé aux vendeurs abonnés (minimum 2h à l&apos;avance)
            </p>
          </div>
        </div>

        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          disabled={disabled}
          onClick={() => handleToggle(!enabled)}
          className={`relative flex h-7 w-12 shrink-0 items-center rounded-full border transition disabled:opacity-50 ${
            enabled ? "border-secondary bg-secondary/30" : "border-slate-700 bg-slate-800"
          }`}
        >
          <span
            className={`flex h-5 w-5 items-center justify-center rounded-full bg-white shadow transition-transform ${
              enabled ? "translate-x-6" : "translate-x-1"
            }`}
          />
        </button>
      </div>

      {enabled && (
        <div className="space-y-3 pt-2 border-t border-slate-800 animate-in fade-in duration-200">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div className="space-y-1">
              <label htmlFor="schedule-date" className="block text-xs font-semibold text-slate-300">
                Date de livraison
              </label>
              <input
                id="schedule-date"
                type="date"
                min={todayStr}
                value={date}
                disabled={disabled}
                onChange={(e) => handleDateTimeChange(e.target.value, time)}
                className="h-11 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 focus:border-secondary focus:outline-none"
              />
            </div>

            <div className="space-y-1">
              <label htmlFor="schedule-time" className="block text-xs font-semibold text-slate-300">
                Heure souhaitée
              </label>
              <input
                id="schedule-time"
                type="time"
                value={time}
                disabled={disabled}
                onChange={(e) => handleDateTimeChange(date, e.target.value)}
                className="h-11 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 focus:border-secondary focus:outline-none"
              />
            </div>
          </div>

          {/* Raccourcis rapides */}
          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            <span className="text-[11px] text-slate-500">Raccourcis :</span>
            <button
              type="button"
              disabled={disabled}
              onClick={() => setQuickPreset(3)}
              className="rounded-lg border border-slate-700 bg-slate-800 px-2 py-1 text-[11px] font-semibold text-slate-300 hover:text-white"
            >
              Dans 3h
            </button>
            <button
              type="button"
              disabled={disabled}
              onClick={() => setQuickPreset(24)}
              className="rounded-lg border border-slate-700 bg-slate-800 px-2 py-1 text-[11px] font-semibold text-slate-300 hover:text-white"
            >
              Demain même heure
            </button>
          </div>

          {error && (
            <div className="flex items-center gap-1.5 rounded-xl border border-danger/40 bg-danger/10 p-2.5 text-xs font-semibold text-danger">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

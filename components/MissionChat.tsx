"use client";

import { useEffect, useRef, useState } from "react";
import { MessageSquare, Send, Loader2, WifiOff } from "lucide-react";
import { sendMissionMessage } from "@/lib/offline-actions";
import { formatDoualaDateTime } from "@/lib/utils";

export interface ChatMessage {
  id: string;
  missionId: string;
  senderId?: string;
  content: string;
  createdAt: string;
  isOptimistic?: boolean;
  sender?: {
    id?: string;
    name?: string | null;
    shopName?: string | null;
    role?: string;
  };
}

interface MissionChatProps {
  missionId: string;
  initialMessages?: ChatMessage[];
  currentUserId?: string;
}

export default function MissionChat({
  missionId,
  initialMessages = [],
  currentUserId,
}: MissionChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [content, setContent] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll au dernier message
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Écoute de l'événement de synchronisation globale pour rafraîchir
  useEffect(() => {
    const handleSync = async () => {
      try {
        const res = await fetch(`/api/missions/${missionId}/messages`);
        if (res.ok) {
          const data = await res.json();
          if (data.messages) {
            setMessages(data.messages);
          }
        }
      } catch {
        // En cas d'échec silencieux
      }
    };

    window.addEventListener("motolink:sync-completed", handleSync);
    return () => {
      window.removeEventListener("motolink:sync-completed", handleSync);
    };
  }, [missionId]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = content.trim();
    if (!trimmed || sending) return;

    setSending(true);
    setContent("");

    try {
      const res = await sendMissionMessage({
        missionId,
        content: trimmed,
      });

      if (res.message) {
        setMessages((prev) => [...prev, res.message]);
      }
    } catch (err) {
      console.error("[MissionChat] Erreur envoi:", err);
    } finally {
      setSending(false);
    }
  };

  return (
    <section className="space-y-3 rounded-2xl border border-slate-800 bg-slate-900 p-4">
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5 text-primary" />
          <h3 className="text-base font-bold text-slate-50">
            Messagerie de la mission
          </h3>
        </div>
        <span className="text-xs text-slate-400">
          {messages.length} message{messages.length > 1 ? "s" : ""}
        </span>
      </div>

      {/* Zone d'affichage des messages */}
      <div className="max-h-60 space-y-2.5 overflow-y-auto pr-1">
        {messages.length === 0 ? (
          <p className="py-6 text-center text-xs text-slate-500">
            Aucun message pour cette course. Échangez ici avec le livreur ou le vendeur.
          </p>
        ) : (
          messages.map((msg) => {
            const isMe = currentUserId && msg.senderId === currentUserId;
            return (
              <div
                key={msg.id}
                className={`flex flex-col ${
                  isMe ? "items-end" : "items-start"
                }`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-sm shadow-sm ${
                    isMe
                      ? "bg-primary text-white"
                      : "bg-slate-800 text-slate-100 border border-slate-700"
                  }`}
                >
                  {!isMe && (
                    <span className="block text-[11px] font-semibold text-slate-400 mb-0.5">
                      {msg.sender?.name || msg.sender?.shopName || "Interlocuteur"}
                    </span>
                  )}
                  <p className="break-words leading-relaxed">{msg.content}</p>
                </div>
                <div className="mt-1 flex items-center gap-1.5 px-1 text-[10px] text-slate-500">
                  <span>{formatDoualaDateTime(msg.createdAt)}</span>
                  {msg.isOptimistic && (
                    <span className="inline-flex items-center gap-0.5 text-warning font-medium">
                      <WifiOff className="h-2.5 w-2.5" /> En attente de synchro
                    </span>
                  )}
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* Formulaire d'envoi */}
      <form onSubmit={handleSendMessage} className="flex items-center gap-2 pt-2">
        <input
          type="text"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Écrire un message..."
          className="flex-1 rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        />
        <button
          type="submit"
          disabled={!content.trim() || sending}
          className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-white shadow-md transition hover:bg-primary/90 disabled:opacity-40"
          title="Envoyer"
        >
          {sending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </button>
      </form>
    </section>
  );
}


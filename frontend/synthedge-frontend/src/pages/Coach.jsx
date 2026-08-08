import React, { useState, useRef, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import ReactMarkdown from "react-markdown";
import { Link, useSearchParams } from "react-router-dom";
import { Sparkles, Send, Plus, Trash2, Copy, Check, Lock, Crown, AlertCircle, Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useProAccess } from "@/hooks/useProAccess";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  listConversations,
  createConversation,
  getConversation,
  deleteConversation,
  streamMessage,
} from "@/api/ai";

const QUICK_PROMPTS = [
  "Review my last few trades.",
  "Why am I losing money?",
  "Am I respecting my trading rules?",
  "What patterns do you notice in my trading?",
];

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
      className="text-muted-foreground hover:text-foreground transition-colors"
      title="Copy message"
    >
      {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
}

function MessageBubble({ message }) {
  const isUser = message.role === "user";
  return (
    <div className={cn("flex", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[85%] sm:max-w-[75%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
          isUser ? "bg-primary text-primary-foreground" : "bg-secondary/60 border border-border/50"
        )}
      >
        {isUser ? (
          <p className="whitespace-pre-wrap">{message.content}</p>
        ) : (
          <div className="[&>p]:my-1.5 [&>ul]:my-1.5 [&>ul]:list-disc [&>ul]:pl-4 [&>ol]:my-1.5 [&>ol]:list-decimal [&>ol]:pl-4 [&_strong]:font-semibold [&_code]:bg-black/10 [&_code]:dark:bg-white/10 [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-xs">
            <ReactMarkdown>{message.content || "…"}</ReactMarkdown>
          </div>
        )}
        {!isUser && message.content && (
          <div className="flex justify-end mt-1.5">
            <CopyButton text={message.content} />
          </div>
        )}
      </div>
    </div>
  );
}

export default function Coach() {
  const { isPro, isLoading: subLoading } = useProAccess();
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();
  const [searchParams, setSearchParams] = useSearchParams();

  const [activeConversationId, setActiveConversationId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(!isMobile);
  const scrollRef = useRef(null);
  const streamingTextRef = useRef("");

  const { data: conversations = [], isLoading: conversationsLoading } = useQuery({
    queryKey: ["ai-conversations"],
    queryFn: listConversations,
    enabled: isPro,
  });

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, streaming]);

  useEffect(() => {
    const q = searchParams.get("q");
    if (q && isPro && !subLoading) {
      setSearchParams({}, { replace: true });
      handleSend(q);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPro, subLoading]);

  async function openConversation(id) {
    setError(null);
    setActiveConversationId(id);
    if (isMobile) setSidebarOpen(false);
    if (!id) {
      setMessages([]);
      return;
    }
    const { messages: loaded } = await getConversation(id);
    setMessages(loaded.map((m) => ({ role: m.role, content: m.content })));
  }

  async function handleDelete(id, e) {
    e.stopPropagation();
    await deleteConversation(id);
    queryClient.invalidateQueries({ queryKey: ["ai-conversations"] });
    if (id === activeConversationId) openConversation(null);
  }

  async function handleSend(overrideText) {
    const text = (overrideText ?? input).trim();
    if (!text || streaming) return;
    setError(null);
    setInput("");

    let conversationId = activeConversationId;
    if (!conversationId) {
      const created = await createConversation(text.slice(0, 60));
      conversationId = created.id;
      setActiveConversationId(conversationId);
      queryClient.invalidateQueries({ queryKey: ["ai-conversations"] });
    }

    setMessages((prev) => [...prev, { role: "user", content: text }, { role: "assistant", content: "" }]);
    setStreaming(true);
    streamingTextRef.current = "";

    await streamMessage(conversationId, text, {
      onDelta: (delta) => {
        streamingTextRef.current += delta;
        setMessages((prev) => {
          const next = [...prev];
          next[next.length - 1] = { role: "assistant", content: streamingTextRef.current };
          return next;
        });
      },
      onDone: () => {
        setStreaming(false);
        queryClient.invalidateQueries({ queryKey: ["ai-conversations"] });
      },
      onError: (message) => {
        setStreaming(false);
        setError(message);
      },
    });
  }

  if (subLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!isPro) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="w-16 h-16 rounded-2xl bg-warning/10 flex items-center justify-center mb-4">
          <Lock className="w-7 h-7 text-warning" />
        </div>
        <h3 className="font-bold text-lg">Pro Feature</h3>
        <p className="text-sm text-muted-foreground mt-2 max-w-sm">
          The AI Trading Coach is available on SynthEdge Pro. Upgrade to get personalized, evidence-based coaching
          from a real mentor that knows your trading history.
        </p>
        <Link to="/upgrade" className="mt-5 flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors">
          <Crown className="w-4 h-4" /> Upgrade to Pro
        </Link>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 bg-background">
      {/* Sidebar: conversation list */}
      <div
        className={cn(
          "border-r border-border/60 flex-shrink-0 flex flex-col bg-card/40 transition-all",
          isMobile
            ? cn("fixed inset-y-0 left-0 z-30 w-72", sidebarOpen ? "translate-x-0" : "-translate-x-full")
            : "w-64"
        )}
      >
        <div className="p-3 border-b border-border/60 flex items-center justify-between gap-2">
          <Button size="sm" className="flex-1 gap-1.5" onClick={() => openConversation(null)}>
            <Plus className="w-3.5 h-3.5" /> New chat
          </Button>
          {isMobile && (
            <button onClick={() => setSidebarOpen(false)} className="text-muted-foreground">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {conversationsLoading && <p className="text-xs text-muted-foreground p-2">Loading…</p>}
          {!conversationsLoading && conversations.length === 0 && (
            <p className="text-xs text-muted-foreground p-2">No conversations yet.</p>
          )}
          {conversations.map((c) => (
            <button
              key={c.id}
              onClick={() => openConversation(c.id)}
              className={cn(
                "w-full text-left px-3 py-2 rounded-lg text-xs flex items-center justify-between group transition-colors",
                c.id === activeConversationId ? "bg-primary/10 text-primary" : "hover:bg-secondary/60"
              )}
            >
              <span className="truncate">{c.title || "Untitled conversation"}</span>
              <Trash2
                className="w-3 h-3 flex-shrink-0 ml-2 opacity-0 group-hover:opacity-100 hover:text-destructive"
                onClick={(e) => handleDelete(c.id, e)}
              />
            </button>
          ))}
        </div>
      </div>
      {isMobile && sidebarOpen && (
        <div className="fixed inset-0 z-20 bg-black/40" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Main chat panel */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="p-3 border-b border-border/60 flex items-center gap-2">
          {isMobile && (
            <button onClick={() => setSidebarOpen(true)} className="text-muted-foreground">
              <Menu className="w-4 h-4" />
            </button>
          )}
          <Sparkles className="w-4 h-4 text-primary" />
          <h1 className="text-sm font-bold">SynthEdge AI Coach</h1>
        </div>

        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
          {messages.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center text-center gap-4 py-12">
              <Sparkles className="w-10 h-10 text-primary/60" />
              <div>
                <h3 className="font-semibold text-sm">Ask your coach anything</h3>
                <p className="text-xs text-muted-foreground mt-1 max-w-xs mx-auto">
                  Grounded in your actual trades, replay sessions, and rules — not generic advice.
                </p>
              </div>
              <div className="flex flex-col gap-1.5 w-full max-w-sm">
                {QUICK_PROMPTS.map((q) => (
                  <button
                    key={q}
                    onClick={() => handleSend(q)}
                    className="px-3 py-2 rounded-xl bg-secondary/50 hover:bg-primary/10 hover:text-primary text-xs text-left transition-colors"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}
          {messages.map((m, i) => (
            <MessageBubble key={i} message={m} />
          ))}
          {streaming && messages[messages.length - 1]?.content === "" && (
            <div className="flex justify-start">
              <div className="bg-secondary/60 border border-border/50 rounded-2xl px-4 py-3 flex gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce [animation-delay:-0.3s]" />
                <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce [animation-delay:-0.15s]" />
                <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce" />
              </div>
            </div>
          )}
          {error && (
            <div className="flex items-start gap-2 p-3 rounded-xl bg-destructive/10 border border-destructive/30 text-xs text-destructive">
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
        </div>

        <div className="p-3 border-t border-border/60 flex items-end gap-2">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Ask about a trade, a session, or a pattern…"
            rows={1}
            className="resize-none min-h-[40px] max-h-32 text-sm"
            disabled={streaming}
          />
          <Button size="icon" onClick={() => handleSend()} disabled={streaming || !input.trim()}>
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '@/lib/store';
import { processUserMessage, SUGGESTED_PROMPTS, type ChatMessage } from '@/lib/aiAssistant';
import { Bot, X, Send, Sparkles, Minimize2, Maximize2 } from 'lucide-react';

export default function AIAssistant() {
  const navigate = useNavigate();
  const { aiAssistantOpen, setAiAssistantOpen, aiChatHistory, addChatMessage, clearChatHistory } = useAppStore();
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [aiChatHistory, loading]);

  useEffect(() => {
    if (aiAssistantOpen) {
      setTimeout(() => inputRef.current?.focus(), 200);
    }
  }, [aiAssistantOpen]);

  const handleSend = async (text?: string) => {
    const msg = (text || input).trim();
    if (!msg || loading) return;

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: msg,
      timestamp: Date.now(),
    };
    addChatMessage(userMsg);
    setInput('');
    setLoading(true);

    try {
      const response = await processUserMessage(msg);
      const assistantMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: response.content,
        timestamp: Date.now(),
        actions: response.actions,
      };
      addChatMessage(assistantMsg);
    } catch {
      addChatMessage({
        id: crypto.randomUUID(),
        role: 'assistant',
        content: 'Sorry, I encountered an error processing your request. Please try again.',
        timestamp: Date.now(),
      });
    } finally {
      setLoading(false);
    }
  };

  const renderContent = (content: string) => {
    return content.split('\n').map((line, i) => {
      const parts = line.split(/(\*\*[^*]+\*\*)/g);
      return (
        <span key={i}>
          {parts.map((part, j) =>
            part.startsWith('**') && part.endsWith('**')
              ? <strong key={j} className="text-white font-semibold">{part.slice(2, -2)}</strong>
              : <span key={j}>{part}</span>
          )}
          {i < content.split('\n').length - 1 && <br />}
        </span>
      );
    });
  };

  return (
    <>
      {/* Floating trigger button */}
      <AnimatePresence>
        {!aiAssistantOpen && (
          <motion.button
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            onClick={() => setAiAssistantOpen(true)}
            className="fixed bottom-6 right-6 z-[90] w-14 h-14 rounded-2xl flex items-center justify-center shadow-2xl"
            style={{
              background: 'linear-gradient(135deg, #38bdf8 0%, #6366f1 100%)',
              boxShadow: '0 8px 32px rgba(56, 189, 248, 0.35), inset 0 1px 0 rgba(255,255,255,0.2)',
            }}
          >
            <Bot className="w-6 h-6 text-white" />
            <span className="absolute -top-1 -right-1 w-3 h-3 bg-accent-green rounded-full animate-pulse" />
          </motion.button>
        )}
      </AnimatePresence>

      {/* Chat panel */}
      <AnimatePresence>
        {aiAssistantOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className={`fixed z-[90] flex flex-col overflow-hidden rounded-2xl border border-white/[0.08] shadow-2xl ${
              expanded
                ? 'bottom-4 right-4 left-4 top-20 lg:left-auto lg:w-[480px]'
                : 'bottom-6 right-6 w-[380px] h-[520px]'
            }`}
            style={{
              background: 'linear-gradient(180deg, rgba(16, 16, 22, 0.98) 0%, rgba(8, 8, 14, 0.98) 100%)',
              backdropFilter: 'blur(24px)',
            }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
              <div className="flex items-center gap-2.5">
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center"
                  style={{ background: 'linear-gradient(135deg, #38bdf8, #6366f1)' }}
                >
                  <Sparkles className="w-4 h-4 text-white" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-white">Vortex AI</h3>
                  <p className="text-[10px] text-white/40">Warehouse Intelligence Assistant</p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => setExpanded(!expanded)} className="p-1.5 text-white/40 hover:text-white rounded-lg hover:bg-white/[0.06]">
                  {expanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                </button>
                <button onClick={() => clearChatHistory()} className="p-1.5 text-white/40 hover:text-white rounded-lg hover:bg-white/[0.06] text-[10px]">
                  Clear
                </button>
                <button onClick={() => setAiAssistantOpen(false)} className="p-1.5 text-white/40 hover:text-white rounded-lg hover:bg-white/[0.06]">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
              {aiChatHistory.length === 0 && (
                <div className="text-center py-6">
                  <Bot className="w-10 h-10 text-accent-sky/40 mx-auto mb-3" />
                  <p className="text-sm text-white/60 mb-4">Ask me anything about your warehouse operations</p>
                  <div className="flex flex-wrap gap-2 justify-center">
                    {SUGGESTED_PROMPTS.map((prompt) => (
                      <button
                        key={prompt}
                        onClick={() => handleSend(prompt)}
                        className="px-3 py-1.5 text-xs rounded-full border border-white/[0.08] text-white/60 hover:text-white hover:border-accent-sky/30 hover:bg-accent-sky/5 transition-all"
                      >
                        {prompt}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {aiChatHistory.map((msg) => (
                <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[85%] px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed ${
                      msg.role === 'user'
                        ? 'bg-accent-sky/15 text-white border border-accent-sky/20 rounded-br-md'
                        : 'bg-white/[0.04] text-white/80 border border-white/[0.06] rounded-bl-md'
                    }`}
                  >
                    {msg.role === 'assistant' && (
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <Sparkles className="w-3 h-3 text-accent-sky" />
                        <span className="text-[10px] text-accent-sky font-medium uppercase tracking-wider">Vortex AI</span>
                      </div>
                    )}
                    <div>{renderContent(msg.content)}</div>
                    {msg.actions && msg.actions.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-2.5 pt-2 border-t border-white/[0.06]">
                        {msg.actions.map((action) => (
                          <button
                            key={action.label}
                            onClick={() => action.path && navigate(action.path)}
                            className="px-2.5 py-1 text-[11px] rounded-lg bg-accent-sky/10 text-accent-sky border border-accent-sky/20 hover:bg-accent-sky/20 transition-colors"
                          >
                            {action.label} →
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {loading && (
                <div className="flex justify-start">
                  <div className="px-4 py-3 rounded-2xl bg-white/[0.04] border border-white/[0.06]">
                    <div className="flex items-center gap-1.5">
                      <div className="w-1.5 h-1.5 bg-accent-sky rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                      <div className="w-1.5 h-1.5 bg-accent-sky rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                      <div className="w-1.5 h-1.5 bg-accent-sky rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="px-4 py-3 border-t border-white/[0.06]">
              <form
                onSubmit={(e) => { e.preventDefault(); handleSend(); }}
                className="flex items-center gap-2"
              >
                <input
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Ask about stock, orders, pressure..."
                  className="flex-1 bg-white/[0.04] border border-white/[0.08] rounded-xl px-3.5 py-2.5 text-sm text-white placeholder:text-white/30 outline-none focus:border-accent-sky/30 transition-colors"
                  disabled={loading}
                />
                <button
                  type="submit"
                  disabled={!input.trim() || loading}
                  className="w-10 h-10 rounded-xl flex items-center justify-center disabled:opacity-30 transition-all"
                  style={{ background: 'linear-gradient(135deg, #38bdf8, #6366f1)' }}
                >
                  <Send className="w-4 h-4 text-white" />
                </button>
              </form>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
import { useState, useEffect, useRef } from "react";

const COLORS = {
  laBlue: "#003DA5",
  laBlueLight: "#0052CC",
  laBluePale: "#E8F0FB",
  gold: "#C8A84B",
  panelLeft: "#F4F6FA",
  panelRight: "#FFFFFF",
  userBubble: "#003DA5",
  aiBubble: "#FFFFFF",
  border: "#DDE3EE",
  textPrimary: "#1A1F2E",
  textMuted: "#6B7280",
  tabActive: "#003DA5",
  tabInactive: "#6B7280",
  success: "#10B981",
};

const EXAMPLE_QUESTIONS = [
  "How do I request a city vehicle?",
  "What's the emergency procurement process under $5,000?",
  "How do I report a workplace injury?",
];

const styles = {
  root: {
    fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif",
    height: "100vh",
    display: "flex",
    flexDirection: "column",
    background: COLORS.panelLeft,
    color: COLORS.textPrimary,
    overflow: "hidden",
  },
  header: {
    background: COLORS.laBlue,
    color: "#fff",
    padding: "0 28px",
    height: "58px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    flexShrink: 0,
    boxShadow: "0 2px 8px rgba(0,61,165,0.25)",
    zIndex: 10,
  },
  headerLeft: {
    display: "flex",
    alignItems: "center",
    gap: "14px",
  },
  headerSeal: {
    width: "34px",
    height: "34px",
    borderRadius: "50%",
    background: COLORS.gold,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "16px",
    fontWeight: "700",
    color: COLORS.laBlue,
    flexShrink: 0,
  },
  headerTitle: {
    fontSize: "15px",
    fontWeight: "600",
    letterSpacing: "0.01em",
  },
  headerSubtitle: {
    fontSize: "11px",
    opacity: 0.7,
    letterSpacing: "0.04em",
    textTransform: "uppercase",
  },
  headerBadge: {
    fontSize: "11px",
    background: "rgba(255,255,255,0.15)",
    border: "1px solid rgba(255,255,255,0.25)",
    borderRadius: "20px",
    padding: "3px 10px",
    color: "#fff",
    letterSpacing: "0.03em",
  },
  body: {
    display: "flex",
    flex: 1,
    overflow: "hidden",
  },
  // LEFT PANEL
  leftPanel: {
    width: "42%",
    minWidth: "320px",
    display: "flex",
    flexDirection: "column",
    borderRight: `1px solid ${COLORS.border}`,
    background: COLORS.panelLeft,
  },
  chatArea: {
    flex: 1,
    overflowY: "auto",
    padding: "20px 18px",
    display: "flex",
    flexDirection: "column",
    gap: "14px",
  },
  welcomeBox: {
    background: COLORS.laBluePale,
    border: `1px solid ${COLORS.border}`,
    borderRadius: "12px",
    padding: "18px 20px",
    marginBottom: "6px",
  },
  welcomeTitle: {
    fontSize: "14px",
    fontWeight: "600",
    color: COLORS.laBlue,
    marginBottom: "6px",
  },
  welcomeText: {
    fontSize: "13px",
    color: COLORS.textMuted,
    lineHeight: "1.5",
    marginBottom: "14px",
  },
  exampleBtn: {
    display: "block",
    width: "100%",
    textAlign: "left",
    background: "#fff",
    border: `1px solid ${COLORS.border}`,
    borderRadius: "8px",
    padding: "9px 12px",
    fontSize: "12.5px",
    color: COLORS.laBlue,
    cursor: "pointer",
    marginBottom: "6px",
    transition: "background 0.15s",
    fontFamily: "inherit",
  },
  messagePair: {
    display: "flex",
    flexDirection: "column",
    gap: "10px",
  },
  userMsg: {
    alignSelf: "flex-end",
    background: COLORS.userBubble,
    color: "#fff",
    borderRadius: "14px 14px 3px 14px",
    padding: "10px 14px",
    maxWidth: "82%",
    fontSize: "13.5px",
    lineHeight: "1.5",
  },
  aiMsg: {
    alignSelf: "flex-start",
    background: COLORS.aiBubble,
    color: COLORS.textPrimary,
    border: `1px solid ${COLORS.border}`,
    borderRadius: "3px 14px 14px 14px",
    padding: "10px 14px",
    maxWidth: "88%",
    fontSize: "13.5px",
    lineHeight: "1.6",
    boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
  },
  aiLabel: {
    fontSize: "10.5px",
    color: COLORS.textMuted,
    marginBottom: "4px",
    fontWeight: "600",
    letterSpacing: "0.05em",
    textTransform: "uppercase",
  },
  loadingDots: {
    display: "flex",
    gap: "5px",
    alignItems: "center",
    padding: "6px 0",
  },
  dot: (i, active) => ({
    width: "7px",
    height: "7px",
    borderRadius: "50%",
    background: active ? COLORS.laBlue : COLORS.border,
    animation: `pulse 1.2s ease-in-out ${i * 0.2}s infinite`,
  }),
  loadingText: {
    fontSize: "12px",
    color: COLORS.textMuted,
    marginLeft: "4px",
  },
  inputArea: {
    borderTop: `1px solid ${COLORS.border}`,
    padding: "14px 16px",
    background: "#fff",
    display: "flex",
    gap: "10px",
    alignItems: "flex-end",
  },
  textarea: {
    flex: 1,
    border: `1.5px solid ${COLORS.border}`,
    borderRadius: "10px",
    padding: "10px 13px",
    fontSize: "13.5px",
    fontFamily: "inherit",
    resize: "none",
    outline: "none",
    lineHeight: "1.5",
    color: COLORS.textPrimary,
    background: COLORS.panelLeft,
    minHeight: "40px",
    maxHeight: "100px",
    transition: "border-color 0.15s",
  },
  sendBtn: (disabled) => ({
    background: disabled ? COLORS.border : COLORS.laBlue,
    color: disabled ? COLORS.textMuted : "#fff",
    border: "none",
    borderRadius: "10px",
    padding: "10px 18px",
    fontSize: "13px",
    fontWeight: "600",
    cursor: disabled ? "not-allowed" : "pointer",
    fontFamily: "inherit",
    transition: "background 0.15s",
    flexShrink: 0,
    height: "40px",
  }),
  // RIGHT PANEL
  rightPanel: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    background: COLORS.panelRight,
    overflow: "hidden",
  },
  rightHeader: {
    padding: "14px 20px 0",
    borderBottom: `1px solid ${COLORS.border}`,
    flexShrink: 0,
  },
  rightHeaderLabel: {
    fontSize: "10.5px",
    fontWeight: "600",
    color: COLORS.textMuted,
    letterSpacing: "0.07em",
    textTransform: "uppercase",
    marginBottom: "10px",
  },
  tabBar: {
    display: "flex",
    gap: "0",
    overflowX: "auto",
    scrollbarWidth: "none",
  },
  tab: (active) => ({
    padding: "8px 14px",
    fontSize: "12px",
    fontWeight: active ? "600" : "400",
    color: active ? COLORS.tabActive : COLORS.tabInactive,
    borderBottom: active ? `2.5px solid ${COLORS.tabActive}` : "2.5px solid transparent",
    cursor: "pointer",
    whiteSpace: "nowrap",
    background: "none",
    border: "none",
    borderBottom: active ? `2.5px solid ${COLORS.tabActive}` : "2.5px solid transparent",
    fontFamily: "inherit",
    transition: "color 0.15s",
    flexShrink: 0,
  }),
  docContent: {
    flex: 1,
    overflowY: "auto",
    padding: "20px 24px",
  },
  docTitle: {
    fontSize: "14px",
    fontWeight: "700",
    color: COLORS.laBlue,
    marginBottom: "6px",
    wordBreak: "break-word",
  },
  docRelevance: {
    fontSize: "12px",
    color: COLORS.success,
    fontStyle: "italic",
    marginBottom: "16px",
    padding: "6px 10px",
    background: "#F0FDF4",
    borderRadius: "6px",
    border: "1px solid #BBF7D0",
  },
  docBody: {
    fontSize: "12.5px",
    fontFamily: "'JetBrains Mono', 'Fira Code', 'Courier New', monospace",
    whiteSpace: "pre-wrap",
    lineHeight: "1.7",
    color: "#374151",
    background: "#FAFAFA",
    padding: "16px",
    borderRadius: "8px",
    border: `1px solid ${COLORS.border}`,
  },
  emptyRight: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    color: COLORS.textMuted,
    gap: "10px",
    padding: "40px",
    textAlign: "center",
  },
  emptyIcon: {
    fontSize: "40px",
    opacity: 0.4,
  },
  emptyTitle: {
    fontSize: "14px",
    fontWeight: "600",
    color: COLORS.textMuted,
  },
  emptyText: {
    fontSize: "12.5px",
    color: COLORS.border,
    maxWidth: "260px",
    lineHeight: "1.5",
  },
};

export default function App() {
  const [messages, setMessages] = useState([]);
  const [query, setQuery] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [primaryDoc, setPrimaryDoc] = useState(null);
  const [relatedDocs, setRelatedDocs] = useState([]);
  const [activeDocIndex, setActiveDocIndex] = useState(0);
  const [dotActive, setDotActive] = useState(0);
  const chatEndRef = useRef(null);
  const textareaRef = useRef(null);

  const allDocs = primaryDoc ? [primaryDoc, ...relatedDocs] : relatedDocs;
  const activeDoc = allDocs[activeDocIndex] || null;

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  // Animate loading dots
  useEffect(() => {
    if (!isLoading) return;
    const interval = setInterval(() => {
      setDotActive((d) => (d + 1) % 3);
    }, 400);
    return () => clearInterval(interval);
  }, [isLoading]);

  const sendMessage = async (overrideQuery) => {
    const q = overrideQuery || query;
    if (!q.trim() || isLoading) return;

    const newMessages = [...messages, { role: "user", content: q }];
    setMessages(newMessages);
    setQuery("");
    setIsLoading(true);

    try {
      const response = await fetch("http://localhost:8000/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages, query: q }),
      });

      if (!response.ok) throw new Error(`Server error: ${response.status}`);
      const data = await response.json();

      setMessages([...newMessages, { role: "assistant", content: data.answer }]);

      if (data.primary_doc) {
        setPrimaryDoc(data.primary_doc);
      }
      if (data.related_docs?.length > 0) {
        setRelatedDocs(data.related_docs);
      }
      setActiveDocIndex(0);
    } catch (err) {
      setMessages([
        ...newMessages,
        {
          role: "assistant",
          content:
            "I couldn't connect to the server. Please make sure the backend is running on port 8000 and try again.",
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div style={styles.root}>
      {/* Keyframe animation injected */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 5px; height: 5px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #DDE3EE; border-radius: 10px; }
        @keyframes pulse { 0%,100% { opacity:0.3; transform:scale(0.85); } 50% { opacity:1; transform:scale(1); } }
        .example-btn:hover { background: #F0F4FF !important; }
        .send-btn:hover:not(:disabled) { background: #0052CC !important; }
        .tab-btn:hover { color: #003DA5 !important; }
      `}</style>

      {/* HEADER */}
      <header style={styles.header}>
        <div style={styles.headerLeft}>
          <div style={styles.headerSeal}>LA</div>
          <div>
            <div style={styles.headerTitle}>DGS SOP Assistant</div>
            <div style={styles.headerSubtitle}>City of Los Angeles · Dept. of General Services</div>
          </div>
        </div>
        <span style={styles.headerBadge}>🔒 Internal Use Only</span>
      </header>

      {/* BODY */}
      <div style={styles.body}>
        {/* LEFT: CHAT */}
        <div style={styles.leftPanel}>
          <div style={styles.chatArea}>
            {/* Welcome state */}
            {messages.length === 0 && (
              <div style={styles.welcomeBox}>
                <div style={styles.welcomeTitle}>👋 Welcome to DGS SOP Assistant</div>
                <div style={styles.welcomeText}>
                  Ask any question about DGS procedures and I'll search the official SOP documents to find your answer.
                </div>
                {EXAMPLE_QUESTIONS.map((q) => (
                  <button
                    key={q}
                    className="example-btn"
                    style={styles.exampleBtn}
                    onClick={() => {
                      setQuery(q);
                      textareaRef.current?.focus();
                    }}
                  >
                    → {q}
                  </button>
                ))}
              </div>
            )}

            {/* Message thread */}
            {messages.map((msg, i) => (
              <div key={i}>
                {msg.role === "user" ? (
                  <div style={{ display: "flex", justifyContent: "flex-end" }}>
                    <div style={styles.userMsg}>{msg.content}</div>
                  </div>
                ) : (
                  <div>
                    <div style={styles.aiLabel}>DGS Assistant</div>
                    <div style={styles.aiMsg}>{msg.content}</div>
                  </div>
                )}
              </div>
            ))}

            {/* Loading indicator */}
            {isLoading && (
              <div>
                <div style={styles.aiLabel}>DGS Assistant</div>
                <div style={styles.aiMsg}>
                  <div style={styles.loadingDots}>
                    {[0, 1, 2].map((i) => (
                      <div key={i} style={styles.dot(i, dotActive === i)} />
                    ))}
                    <span style={styles.loadingText}>Searching SOP documents…</span>
                  </div>
                </div>
              </div>
            )}

            <div ref={chatEndRef} />
          </div>

          {/* INPUT */}
          <div style={styles.inputArea}>
            <textarea
              ref={textareaRef}
              style={styles.textarea}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask a procedural question…"
              rows={1}
              disabled={isLoading}
            />
            <button
              className="send-btn"
              style={styles.sendBtn(!query.trim() || isLoading)}
              onClick={() => sendMessage()}
              disabled={!query.trim() || isLoading}
            >
              Send
            </button>
          </div>
        </div>

        {/* RIGHT: DOCUMENT VIEWER */}
        <div style={styles.rightPanel}>
          {allDocs.length === 0 ? (
            <div style={styles.emptyRight}>
              <div style={styles.emptyIcon}>📋</div>
              <div style={styles.emptyTitle}>Source documents appear here</div>
              <div style={styles.emptyText}>
                When you ask a question, I'll search the DGS SOP library and show you the relevant documents in this panel.
              </div>
            </div>
          ) : (
            <>
              {/* Tab bar */}
              <div style={styles.rightHeader}>
                <div style={styles.rightHeaderLabel}>Source Documents</div>
                <div style={styles.tabBar}>
                  {allDocs.map((doc, i) => (
                    <button
                      key={i}
                      className="tab-btn"
                      style={styles.tab(activeDocIndex === i)}
                      onClick={() => setActiveDocIndex(i)}
                    >
                      {i === 0 ? "⭐ " : ""}
                      {doc.title
                        ? doc.title.replace(/\.txt$/, "").replace(/^SOP-\d+-/, "").replace(/-/g, " ")
                        : `Document ${i + 1}`}
                    </button>
                  ))}
                </div>
              </div>

              {/* Document content */}
              {activeDoc && (
                <div style={styles.docContent}>
                  <div style={styles.docTitle}>{activeDoc.title}</div>
                  {activeDoc.relevance && (
                    <div style={styles.docRelevance}>✓ {activeDoc.relevance}</div>
                  )}
                  <div style={styles.docBody}>{activeDoc.content}</div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

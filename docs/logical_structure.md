# Logical Structure Document
## DGS SOP Assistant — Architectural Overview & Data Flow

---

## 1. System Overview

The DGS SOP Assistant is a three-layer system:

```
[ React Frontend ]  ←→  [ Python Backend (FastAPI) ]  ←→  [ Google Drive API + Groq LLM ]
```

The user interacts only with the frontend. The frontend sends messages to the backend. The backend authenticates with Google Drive via OAuth 2.0, fetches all SOP documents, ranks them by relevance to the query, builds a focused prompt, calls the Groq API, and returns a cited answer. The frontend renders the answer in the left chat panel and the source document in the right panel.

---

## 2. Component Breakdown

### 2.1 Frontend — React (App.jsx)
- Single-page application with a **split-panel layout**
- **Left panel:** Chat interface — user types questions, sees conversation history and AI answers
- **Right panel:** Document viewer — shows the primary source document the LLM cited, plus up to 5 additional related documents as clickable tabs
- Maintains full conversation history in React `useState` (multi-turn memory within a session)
- Sends `POST /api/chat` to the Python backend on each user message
- Parses the response to extract: answer text, primary document, and list of related documents

### 2.2 Backend — Python FastAPI (main.py)
- Exposes a single REST endpoint: `POST /api/chat`
- On each request:
  1. Authenticates with Google Drive via OAuth 2.0 (uses saved `token.pickle` after first login)
  2. Searches Drive for the `DGS-SOPs` folder by name
  3. Downloads all `.txt` SOP files from that folder
  4. Builds an in-memory `doc_map`: `{ filename: full_content }`
  5. Ranks documents by keyword relevance to the user's query
  6. Selects the top-ranked docs that fit within the token budget (~20,000 characters)
  7. Builds a lean system prompt asking Groq to return an answer + document titles only (not full content)
  8. Calls the Groq API with full conversation history
  9. Parses the JSON response to get answer text + relevant filenames
  10. Looks up full document content from `doc_map` and attaches it
  11. Returns `ChatResponse` to the frontend

### 2.3 AI Layer — Groq API (llama-3.3-70b-versatile)
- Free tier, no credit card required
- Receives a focused system prompt (top-ranked SOP docs) + conversation history
- Returns a compact JSON object: `{ answer, primary_doc_title, primary_doc_relevance, related_doc_titles }`
- The backend attaches full document content from memory — Groq never outputs large document text
- Temperature set to 0.1 for factual, deterministic answers

### 2.4 Data Source — Google Drive (DGS-SOPs folder)
- Folder: `Dept-Of-Los-Angeles/DGS-SOPs/`
- Contains 7 plain-text SOP `.txt` files
- Accessed via Google Drive REST API with OAuth 2.0 (read-only scope)
- No database used — Drive is the single source of truth
- Adding new SOPs requires only uploading a new `.txt` file — no code changes

---

## 3. Data Flow Diagram

```
USER TYPES QUESTION
        │
        ▼
┌─────────────────────┐
│   React Frontend    │
│  (App.jsx)          │
│                     │
│  Stores:            │
│  - messages[]       │
│  - primaryDoc       │
│  - relatedDocs[]    │
│  - activeDocIndex   │
└────────┬────────────┘
         │ POST /api/chat
         │ { messages: [...], query: string }
         ▼
┌──────────────────────────────┐
│  Python Backend              │
│  (FastAPI main.py)           │
│                              │
│  1. OAuth → Drive service    │
│  2. Find DGS-SOPs folder     │
│  3. Fetch all 7 .txt files   │
│  4. Build doc_map in memory  │
│  5. Rank docs by keywords    │
│  6. Select docs under limit  │
│  7. Build lean system prompt │
│  8. Call Groq API            │
│  9. Parse JSON response      │
│  10. Attach content from map │
└──────┬───────────────────────┘
       │
       ├──────────────────────────────────────────────┐
       │ GET files (Google Drive REST API)            │
       ▼                                              │
┌─────────────────────┐                              │
│  Google Drive API   │                              │
│                     │                              │
│  OAuth 2.0 auth     │                              │
│  token.pickle       │                              │
│  Folder: DGS-SOPs   │                              │
│  7 x .txt files     │                              │
└──────────┬──────────┘                              │
           │ File contents returned                  │
           └──────────────────────────────────────┐  │
                                                  ▼  ▼
                                    ┌─────────────────────┐
                                    │  Keyword Ranker     │
                                    │                     │
                                    │  Scores each doc    │
                                    │  by query word hits │
                                    │  Selects top docs   │
                                    │  under 20k chars    │
                                    └──────────┬──────────┘
                                               │
                                    ┌──────────▼──────────┐
                                    │  System Prompt      │
                                    │  (selected docs     │
                                    │   embedded inline)  │
                                    │  + all filenames    │
                                    └──────────┬──────────┘
                                               │ POST /chat/completions
                                               ▼
                                    ┌─────────────────────┐
                                    │  Groq API           │
                                    │  llama-3.3-70b      │
                                    │                     │
                                    │  Returns compact    │
                                    │  JSON with:         │
                                    │  - answer text      │
                                    │  - primary title    │
                                    │  - related titles   │
                                    └──────────┬──────────┘
                                               │
                                    ┌──────────▼──────────┐
                                    │  Backend attaches   │
                                    │  full content from  │
                                    │  doc_map lookup     │
                                    └──────────┬──────────┘
                                               │ ChatResponse JSON
                                               ▼
                                    ┌─────────────────────┐
                                    │   React Frontend    │
                                    │                     │
                                    │  LEFT PANEL:        │
                                    │  Renders answer     │
                                    │                     │
                                    │  RIGHT PANEL:       │
                                    │  Primary doc +      │
                                    │  related doc tabs   │
                                    └─────────────────────┘
```

---

## 4. Why Groq Returns Titles Only (Key Design Decision)

An early version of this app asked Groq to return the full document text in its JSON response. This caused two problems:

1. **Token limit exceeded:** The Groq free tier has a 12,000 tokens-per-minute limit. Returning 7 full SOP documents in the response exceeded this and caused `413 Request Too Large` errors.
2. **JSON truncation:** Even when tokens were reduced, `max_tokens` limits caused the JSON to be cut off mid-response, making it unparseable.

**The solution:** Groq only returns the answer text and document filenames. The backend maintains a `doc_map` dictionary with all document content fetched from Drive, and looks up the full content by filename after receiving Groq's response. This keeps Groq's output small and reliable.

---

## 5. Conversation Memory Model

```
Session Start
    │
    ▼
messages = [
  { role: "user",      content: "How do I request a city vehicle?" },
  { role: "assistant", content: "..." },
  { role: "user",      content: "What if I need it same-day?" },
  { role: "assistant", content: "..." }
]
    │
    ▼
Every new message → full messages[] sent to backend as plain list of dicts
Backend prepends system prompt, appends new query, passes full list to Groq
Groq has full conversation context for follow-up questions
    │
    ▼
Session End → messages[] cleared (in-memory only, never persisted to disk)
```

**Important:** Messages must be passed as a plain Python list of `{"role": str, "content": str}` dicts. Do not use spread operators (`*list`) or pass Pydantic model objects directly — the Groq SDK requires plain dicts.

---

## 6. File & Folder Structure

```
dgs-sop-assistant/
│
├── docs/
│   ├── business_statement.md        ← Business case and ROI
│   ├── logical_structure.md         ← This document
│   └── technical_implementation.md  ← Step-by-step build guide
│
├── backend/
│   ├── main.py                      ← FastAPI server (single file)
│   ├── credentials.json             ← Google OAuth credentials (DO NOT COMMIT)
│   └── token.pickle                 ← Auto-saved OAuth token (DO NOT COMMIT)
│
├── frontend/
│   └── App.jsx                      ← React app (single file, goes in src/)
│
├── requirements.txt                 ← Python dependencies (use >= not == versions)
└── .env                             ← GROQ_API_KEY (DO NOT COMMIT)
```

---

## 7. Technology Choices & Rationale

| Technology | Choice | Reason |
|---|---|---|
| Frontend | React + Vite | Fast setup, component-based, split-panel layout |
| Backend | Python + FastAPI | Async-native, simple CORS, readable single-file structure |
| LLM | Groq (llama-3.3-70b-versatile) | Completely free, no credit card, strong JSON instruction-following |
| Drive Access | Google Drive REST API + OAuth 2.0 | Secure, user-authenticated, read-only scope |
| Document Retrieval | Keyword ranking + prompt injection | Simple and effective for 7 documents; no RAG complexity needed |
| Conversation Memory | React useState | Stateless backend; session memory held in frontend only |
| Database | None | No persistence needed; Drive is the source of truth |

---

## 8. Known Constraints

| Constraint | Detail |
|---|---|
| Groq free tier token limit | 12,000 tokens/minute. Solved by ranking docs and injecting only the most relevant subset into the prompt |
| Python version | Tested on Python 3.14. Use `>=` version pins in requirements.txt — pinned `==` versions may fail to build on Python 3.13+ |
| Groq message format | Messages must be plain `list` of `dict` — do not pass Pydantic objects or use spread operators |
| OAuth browser popup | First run opens a browser for Google login. `token.pickle` is saved after — subsequent runs are automatic |
| Google OAuth test mode | App stays in "testing" mode for personal projects. Add your Gmail as a test user in Google Cloud Console → APIs & Services → OAuth consent screen → Audience |

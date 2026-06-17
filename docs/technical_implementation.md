# Technical Implementation Guide
## DGS SOP Assistant — Step-by-Step Build Instructions

> This document is written with enough precision that an AI agent (e.g. Gemini) can re-generate all application artifacts from this text alone. Every file name, endpoint, data shape, prompt, and API call is specified explicitly. Lessons from real implementation are included as notes throughout.

---

## 0. Prerequisites

- Python 3.11 or higher (tested on Python 3.14)
- Node.js 18+ and npm
- A Google account with Google Drive access
- A free Groq API key — sign up at https://console.groq.com (no credit card required)
- A Google Cloud project with the Drive API enabled and OAuth 2.0 credentials downloaded as `credentials.json`
- The 7 SOP `.txt` files uploaded to a folder named exactly `DGS-SOPs` in Google Drive

---

## 1. Project Directory Structure

```
dgs-sop-assistant/
├── docs/
│   ├── business_statement.md
│   ├── logical_structure.md
│   └── technical_implementation.md   ← this file
├── backend/
│   ├── main.py                        ← FastAPI server
│   ├── credentials.json               ← Downloaded from Google Cloud Console (DO NOT COMMIT)
│   └── token.pickle                   ← Auto-generated after first OAuth login (DO NOT COMMIT)
├── frontend/
│   └── App.jsx                        ← React single-file app (placed in src/ after Vite setup)
├── requirements.txt
└── .env                               ← GROQ_API_KEY (DO NOT COMMIT)
```

---

## 2. Environment Setup

### 2.1 Python Virtual Environment

```bash
# From the project root directory
python -m venv venv

# Activate on Mac/Linux:
source venv/bin/activate

# Activate on Windows (PowerShell):
venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt
```

### 2.2 requirements.txt

> **Important:** Use `>=` (minimum version) pins, NOT `==` (exact version) pins.
> Exact pins like `pydantic==2.7.1` will fail to build on Python 3.13+ because
> `pydantic-core` requires Rust compilation that is not compatible with newer Python versions.
> Using `>=` allows pip to select a pre-built wheel that supports your Python version.

```
fastapi>=0.115.0
uvicorn>=0.30.0
groq>=0.11.0
google-auth>=2.29.0
google-auth-oauthlib>=1.2.0
google-api-python-client>=2.126.0
python-dotenv>=1.0.1
pydantic>=2.9.0
```

### 2.3 .env File

Create a `.env` file in the project root (same level as `requirements.txt`):

```
GROQ_API_KEY=your_groq_api_key_here
```

---

## 3. Google Cloud OAuth Setup (One-Time)

### Step 1 — Create a Google Cloud Project
1. Go to https://console.cloud.google.com
2. Click the project dropdown at the top → **New Project**
3. Name it `dgs-sop-assistant` → **Create**

### Step 2 — Enable the Google Drive API
1. Left menu → **APIs & Services** → **Library**
2. Search `Google Drive API` → Click it → **Enable**

### Step 3 — Configure OAuth Consent Screen
1. Left menu → **APIs & Services** → **OAuth consent screen**
   *(In the new Google Cloud UI, this may appear as "Google Auth Platform" → "Audience")*
2. User Type: **External** → **Create**
3. App name: `DGS SOP Assistant`
4. User support email: your Gmail address
5. Developer contact email: your Gmail address
6. Click **Save and Continue** through all remaining screens
7. On the **Test users** section (may be under **Audience** in the left sidebar):
   - Click **+ Add Users**
   - Enter your Gmail address (e.g. `<user>@gmail.com`)
   - Click **Save**

> **Note:** If you skip adding yourself as a test user, you will get an
> `Error 403: access_denied` screen when the OAuth browser popup opens.
> The app stays in "testing" mode for personal/demo projects — this is expected
> and does not affect functionality.

### Step 4 — Create OAuth 2.0 Credentials
1. Left menu → **APIs & Services** → **Credentials**
2. Click **Create Credentials** → **OAuth Client ID**
3. Application type: **Desktop app**
4. Name: `DGS Backend` (or anything)
5. Click **Create** → **Download JSON**
6. Rename the downloaded file to exactly `credentials.json`
7. Move it into the `backend/` folder

### Step 5 — First Run OAuth Flow
When you start the backend for the first time, a browser window opens automatically:
- You may see "Google hasn't verified this app" — click **Continue** (bottom left)
- Sign in with the Gmail you added as a test user
- Click **Allow** to grant Drive read access
- The browser will show "Authentication successful" and close
- A `token.pickle` file is saved in `backend/` — future runs use this automatically

> **To re-authenticate:** Delete `token.pickle` and restart the backend.

---

## 4. Backend — main.py (FastAPI)

The backend is a single file. It does four things:
1. Authenticates with Google Drive via OAuth and fetches all SOP `.txt` files
2. Ranks documents by keyword relevance to the user's query
3. Builds a lean system prompt and calls Groq (which returns titles only, not full content)
4. Attaches full document content from memory and returns the response

### 4.1 Full main.py

```python
import os
import json
import pickle
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
from dotenv import load_dotenv
from groq import Groq
from google_auth_oauthlib.flow import InstalledAppFlow
from google.auth.transport.requests import Request
from googleapiclient.discovery import build

load_dotenv()

app = FastAPI(title="DGS SOP Assistant API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

groq_client = Groq(api_key=os.getenv("GROQ_API_KEY"))

SCOPES = ["https://www.googleapis.com/auth/drive.readonly"]
TOKEN_PATH = "token.pickle"
CREDENTIALS_PATH = "credentials.json"
SOP_FOLDER_NAME = "DGS-SOPs"
MAX_PROMPT_CHARS = 20000  # Stay safely under Groq free tier's 12,000 TPM limit


def get_drive_service():
    creds = None
    if os.path.exists(TOKEN_PATH):
        with open(TOKEN_PATH, "rb") as f:
            creds = pickle.load(f)
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            flow = InstalledAppFlow.from_client_secrets_file(CREDENTIALS_PATH, SCOPES)
            creds = flow.run_local_server(port=0)
        with open(TOKEN_PATH, "wb") as f:
            pickle.dump(creds, f)
    return build("drive", "v3", credentials=creds)


def get_sop_folder_id(service):
    results = service.files().list(
        q=f"mimeType='application/vnd.google-apps.folder' and name='{SOP_FOLDER_NAME}' and trashed=false",
        fields="files(id, name)",
    ).execute()
    files = results.get("files", [])
    return files[0]["id"] if files else None


def fetch_all_sops(service, folder_id: str):
    results = service.files().list(
        q=f"'{folder_id}' in parents and mimeType='text/plain' and trashed=false",
        fields="files(id, name)",
        orderBy="name",
    ).execute()
    docs = []
    for file in results.get("files", []):
        content = service.files().get_media(fileId=file["id"]).execute()
        docs.append({
            "title": file["name"],
            "content": content.decode("utf-8") if isinstance(content, bytes) else str(content),
        })
    return docs


def rank_docs_by_relevance(query: str, all_docs: List[dict]) -> List[dict]:
    stop_words = {"the", "a", "an", "is", "it", "to", "do", "i", "how", "what",
                  "when", "where", "who", "why", "can", "my", "for", "of", "in",
                  "and", "or", "get", "need", "want"}
    query_words = set(query.lower().split()) - stop_words
    scored = []
    for doc in all_docs:
        text = (doc["title"] + " " + doc["content"]).lower()
        score = sum(1 for word in query_words if word in text)
        scored.append((score, doc))
    scored.sort(key=lambda x: x[0], reverse=True)
    return [doc for _, doc in scored]


def select_docs_for_prompt(query: str, all_docs: List[dict]):
    ranked = rank_docs_by_relevance(query, all_docs)
    selected = []
    char_count = 0
    for doc in ranked:
        doc_chars = len(doc["title"]) + len(doc["content"])
        if char_count + doc_chars < MAX_PROMPT_CHARS:
            selected.append(doc)
            char_count += doc_chars
    return selected


def build_system_prompt(selected_docs: List[dict], all_titles: List[str]) -> str:
    docs_block = ""
    for i, doc in enumerate(selected_docs):
        docs_block += f"\n\n--- DOCUMENT {i+1}: {doc['title']} ---\n{doc['content']}"

    all_titles_block = "\n".join(f"- {t}" for t in all_titles)

    return (
        "You are the DGS SOP Assistant for the City of Los Angeles Department of General Services.\n\n"
        "You have access to these SOP documents:\n"
        + docs_block
        + "\n\nAll available SOP filenames:\n"
        + all_titles_block
        + "\n\nInstructions:\n"
        "1. Write a clear plain-English answer using specific steps, form numbers, and contacts.\n"
        "2. Identify the single most relevant document filename as primary_doc_title.\n"
        "3. Identify up to 5 other relevant filenames as related_doc_titles.\n"
        "4. Only use filenames from the list above.\n"
        "5. Respond with ONLY valid JSON, no markdown, no text outside the JSON.\n\n"
        "Required JSON format (return titles only — do NOT include document content):\n"
        '{\n'
        '  "answer": "your plain English answer here",\n'
        '  "primary_doc_title": "exact filename of most relevant document",\n'
        '  "primary_doc_relevance": "one sentence why this is primary",\n'
        '  "related_doc_titles": [\n'
        '    {"title": "exact filename", "relevance": "one sentence how this relates"}\n'
        '  ]\n'
        '}'
    )


class Message(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    messages: List[Message]
    query: str

class Document(BaseModel):
    title: str
    content: str
    relevance: Optional[str] = None

class ChatResponse(BaseModel):
    answer: str
    primary_doc: Optional[Document] = None
    related_docs: List[Document] = []


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/api/chat", response_model=ChatResponse)
async def chat(request: ChatRequest):
    raw_text = ""
    try:
        service = get_drive_service()
        folder_id = get_sop_folder_id(service)
        if not folder_id:
            raise HTTPException(status_code=404, detail=f"Folder '{SOP_FOLDER_NAME}' not found.")
        all_docs = fetch_all_sops(service, folder_id)
        if not all_docs:
            raise HTTPException(status_code=404, detail="No .txt files found in DGS-SOPs folder.")

        doc_map = {doc["title"]: doc["content"] for doc in all_docs}
        all_titles = list(doc_map.keys())
        selected_docs = select_docs_for_prompt(request.query, all_docs)
        system_prompt = build_system_prompt(selected_docs, all_titles)

        # Build messages as a plain list of dicts
        # IMPORTANT: Do not use spread operators (*list) or pass Pydantic objects
        # directly — the Groq SDK requires plain {"role": str, "content": str} dicts
        messages_list = []
        messages_list.append({"role": "system", "content": system_prompt})
        for msg in request.messages:
            messages_list.append({"role": str(msg.role), "content": str(msg.content)})
        messages_list.append({"role": "user", "content": str(request.query)})

        completion = groq_client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=messages_list,
            temperature=0.1,
            max_tokens=2048,
        )

        raw_text = completion.choices[0].message.content.strip()

        # Extract JSON robustly — find first { and last } regardless of surrounding text
        clean_text = raw_text
        if "```" in clean_text:
            for part in clean_text.split("```"):
                part = part.strip()
                if part.startswith("json"):
                    part = part[4:].strip()
                if part.startswith("{"):
                    clean_text = part
                    break

        start = clean_text.find("{")
        end = clean_text.rfind("}")
        if start != -1 and end != -1:
            clean_text = clean_text[start:end + 1]

        parsed = json.loads(clean_text)

        # Attach full document content from doc_map — NOT from Groq's response
        # Groq only returned filenames; we look up full content here
        primary = None
        primary_title = parsed.get("primary_doc_title", "")
        if primary_title and primary_title in doc_map:
            primary = Document(
                title=primary_title,
                content=doc_map[primary_title],
                relevance=parsed.get("primary_doc_relevance", "")
            )

        related = []
        for item in parsed.get("related_doc_titles", []):
            title = item.get("title", "") if isinstance(item, dict) else str(item)
            if title and title in doc_map:
                related.append(Document(
                    title=title,
                    content=doc_map[title],
                    relevance=item.get("relevance", "") if isinstance(item, dict) else ""
                ))

        return ChatResponse(
            answer=parsed.get("answer", ""),
            primary_doc=primary,
            related_docs=related
        )

    except json.JSONDecodeError:
        return ChatResponse(
            answer=raw_text or "Sorry, could not parse the response. Please try again.",
            primary_doc=None,
            related_docs=[]
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
```

### 4.2 Running the Backend

```bash
# Make sure you are inside the backend/ folder with venv activated
cd backend
uvicorn main:app --reload --port 8000
```

The server starts at `http://127.0.0.1:8000`. On first run, a browser window opens for Google OAuth.

To verify it is working, visit `http://127.0.0.1:8000/health` — you should see `{"status":"ok"}`.

> **Note:** The `404 Not Found` on `GET /` is normal — there is no homepage route.

---

## 5. Frontend — App.jsx (React + Vite)

### 5.1 Vite Project Setup

```bash
# From the project root
cd frontend
npm create vite@latest . -- --template react
# When asked "Current directory is not empty, remove existing files?" → Y
# Framework → React
# Variant → JavaScript

npm install

# Copy our App.jsx into src/ (overwrite the Vite default)
# On Windows PowerShell:
copy App.jsx src\App.jsx
# On Mac/Linux:
cp App.jsx src/App.jsx

npm run dev
```

Frontend runs at `http://localhost:5173`.

> **Common mistake:** Vite creates a default `src/App.jsx`. You must overwrite it with our
> custom `App.jsx`. If you see "Get started — Edit src/App.jsx and save to test HMR",
> the overwrite did not happen yet.

### 5.2 Layout Structure

```
┌─────────────────────────────────────────────────────────────┐
│  HEADER: "DGS SOP Assistant" | "City of Los Angeles · DGS" │
│  [LA gold seal]                          [Internal Use Only]│
├──────────────────────┬──────────────────────────────────────┤
│  LEFT PANEL (42%)    │  RIGHT PANEL (58%)                   │
│  bg: #F4F6FA         │  bg: #FFFFFF                         │
│                      │                                      │
│  Welcome box with    │  "SOURCE DOCUMENTS" label            │
│  3 example questions │  Tab bar: [⭐ Primary] [Doc 2] ...   │
│  (on first load)     │                                      │
│  ────────────────    │  Document title (blue, bold)         │
│  User bubble (right) │  Relevance note (green, italic)      │
│  AI bubble (left)    │  ─────────────────────────────       │
│  Loading dots        │  Full document text                  │
│                      │  (monospace, pre-wrap, scrollable)   │
│  [textarea] [Send]   │                                      │
└──────────────────────┴──────────────────────────────────────┘
```

### 5.3 Key State Variables

```javascript
const [messages, setMessages] = useState([]);
// Shape: [{ role: "user"|"assistant", content: string }]

const [query, setQuery] = useState("");
const [isLoading, setIsLoading] = useState(false);

const [primaryDoc, setPrimaryDoc] = useState(null);
// Shape: { title: string, content: string, relevance: string }

const [relatedDocs, setRelatedDocs] = useState([]);
// Shape: [{ title, content, relevance }, ...]

const [activeDocIndex, setActiveDocIndex] = useState(0);
// 0 = primary doc tab, 1–5 = related doc tabs
```

### 5.4 sendMessage Function

```javascript
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
      body: JSON.stringify({
        messages: messages,  // history BEFORE this message
        query: q
      }),
    });

    if (!response.ok) throw new Error(`Server error: ${response.status}`);
    const data = await response.json();

    setMessages([...newMessages, { role: "assistant", content: data.answer }]);
    if (data.primary_doc) setPrimaryDoc(data.primary_doc);
    if (data.related_docs?.length > 0) setRelatedDocs(data.related_docs);
    setActiveDocIndex(0);

  } catch (err) {
    setMessages([...newMessages, {
      role: "assistant",
      content: "I couldn't connect to the server. Please make sure the backend is running on port 8000 and try again."
    }]);
  } finally {
    setIsLoading(false);
  }
};
```

### 5.5 Document Panel Logic

```javascript
const allDocs = primaryDoc ? [primaryDoc, ...relatedDocs] : relatedDocs;
const activeDoc = allDocs[activeDocIndex] || null;
```

Tab labels strip `.txt` extension and `SOP-XXX-` prefix for readability:
```javascript
doc.title.replace(/\.txt$/, "").replace(/^SOP-\d+-/, "").replace(/-/g, " ")
```

Primary doc tab always shows a ⭐ prefix.

### 5.6 Color Scheme

```javascript
const COLORS = {
  laBlue: "#003DA5",       // Header, primary accents, user bubbles
  gold: "#C8A84B",         // LA seal badge
  panelLeft: "#F4F6FA",    // Chat panel background
  panelRight: "#FFFFFF",   // Document panel background
  border: "#DDE3EE",
  textPrimary: "#1A1F2E",
  textMuted: "#6B7280",
  success: "#10B981",      // Relevance note background
}
```

---

## 6. API Contract

### Request
`POST http://localhost:8000/api/chat`

```json
{
  "messages": [
    { "role": "user", "content": "How do I request a city vehicle?" },
    { "role": "assistant", "content": "To request a city vehicle..." }
  ],
  "query": "What if I need it same-day?"
}
```

### Response
```json
{
  "answer": "For same-day vehicle requests, you need Division Manager phone authorization...",
  "primary_doc": {
    "title": "SOP-005-City-Vehicle-Request.txt",
    "content": "CITY OF LOS ANGELES\nDEPARTMENT OF GENERAL SERVICES\n...",
    "relevance": "This document outlines the step-by-step procedure for requesting a city vehicle."
  },
  "related_docs": [
    {
      "title": "SOP-001-Emergency-Procurement.txt",
      "content": "CITY OF LOS ANGELES\n...",
      "relevance": "Relevant if the vehicle is needed for an emergency procurement situation."
    }
  ]
}
```

---

## 7. End-to-End Request Trace

**User types:** `"How do I report a broken air conditioner?"`

1. Frontend appends to `messages[]`, POSTs `{ messages: [], query: "How do I report a broken air conditioner?" }` to `http://localhost:8000/api/chat`
2. Backend loads saved `token.pickle`, creates authenticated Drive service
3. Backend searches Drive for folder named `DGS-SOPs`, gets its folder ID
4. Backend downloads all 7 `.txt` files, builds `doc_map` dict in memory
5. Backend scores each doc by keyword overlap with the query (`broken`, `air`, `conditioner`, `report`)
6. Top-ranked docs (e.g. SOP-002 Facility Maintenance, SOP-006 Safety) selected up to 20,000 chars
7. System prompt built with selected doc content + list of all 7 filenames
8. Messages list built as plain Python list of dicts: `[system, user_query]`
9. Groq (`llama-3.3-70b-versatile`) called with `temperature=0.1`, `max_tokens=2048`
10. Groq returns compact JSON: `{ answer: "...", primary_doc_title: "SOP-002-...", related_doc_titles: [...] }`
11. Backend extracts JSON using `find("{")` / `rfind("}")` to handle any surrounding text
12. Backend looks up full content for each title from `doc_map`
13. `ChatResponse` returned to frontend
14. Frontend sets `messages`, `primaryDoc`, `relatedDocs`, resets `activeDocIndex` to 0
15. Left panel shows answer; right panel shows SOP-002 full text with related doc tabs

---

## 8. Common Errors and Fixes

| Error | Cause | Fix |
|---|---|---|
| `pydantic-core` build fails | Python 3.13+ incompatible with pinned `==` versions | Use `>=` version pins in requirements.txt |
| `Error 403: access_denied` on OAuth | Gmail not added as test user | Go to Google Cloud Console → OAuth consent screen → Audience → Add test user |
| `Google hasn't verified this app` warning | App in testing mode (expected) | Click **Continue** — this is normal for personal projects |
| `Folder 'DGS-SOPs' not found` | Wrong Drive account or wrong folder name | Ensure you authorized the correct Gmail and folder is named exactly `DGS-SOPs` |
| `413 Request Too Large` from Groq | Too many tokens sent (free tier limit: 12,000 TPM) | Already solved via `select_docs_for_prompt()` — do not embed all docs at once |
| `JSONDecodeError` | Groq returned truncated JSON | Solved by asking Groq for titles only, not full content. `max_tokens=2048` is sufficient |
| `grm ERROR [iterable]` in browser console | Grammarly browser extension conflict | This is a Grammarly extension error, not our app. Safely ignore it |
| `500 Internal Server Error` with no terminal output | PowerShell suppresses stderr | Run `uvicorn main:app --port 8000 --log-level debug` to see full traceback |
| Vite default page shows instead of our app | App.jsx not copied to `src/` | Run `copy App.jsx src\App.jsx` (Windows) or `cp App.jsx src/App.jsx` (Mac/Linux) |
| `CORS error` in browser | Backend not running | Start uvicorn on port 8000 in a separate terminal |
| `token.pickle` expired | OAuth token stale | Delete `token.pickle` from `backend/` and restart backend |
| `groq.AuthenticationError` | Wrong or missing API key | Check `.env` file contains correct `GROQ_API_KEY` |

---

## 9. Adding New SOP Documents

1. Create a new `.txt` file following the naming convention: `SOP-XXX-Topic-Name.txt`
2. Upload it to the `DGS-SOPs` folder in Google Drive
3. No code changes required — `fetch_all_sops()` fetches all `.txt` files dynamically on every request

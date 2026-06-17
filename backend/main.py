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
MAX_PROMPT_CHARS = 20000


def get_drive_service():
    creds = None
    if os.path.exists(TOKEN_PATH):
        with open(TOKEN_PATH, "rb") as f:
            creds = pickle.load(f)
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            if not os.path.exists(CREDENTIALS_PATH):
                raise FileNotFoundError("credentials.json not found in backend/ folder.")
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
    """Keyword-based ranking — returns all docs sorted by relevance score."""
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
    """Select docs that fit within MAX_PROMPT_CHARS, ranked by relevance."""
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
    """
    Build a lean system prompt.
    Groq only needs to return: answer text + document titles (not full content).
    We attach full content from memory on the backend side.
    """
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
        "1. Write a clear plain-English answer using specific steps, form numbers, and contacts from the documents.\n"
        "2. Identify the single most relevant document filename as primary_doc_title.\n"
        "3. Identify up to 5 other relevant document filenames as related_doc_titles.\n"
        "4. Only use filenames from the list above.\n"
        "5. Respond with ONLY valid JSON, no markdown, no text outside the JSON.\n\n"
        "Required JSON format (titles only — do NOT include document content):\n"
        '{\n'
        '  "answer": "your plain English answer here",\n'
        '  "primary_doc_title": "exact filename of most relevant document",\n'
        '  "primary_doc_relevance": "one sentence why this is primary",\n'
        '  "related_doc_titles": [\n'
        '    {"title": "exact filename", "relevance": "one sentence how this relates"},\n'
        '    {"title": "exact filename", "relevance": "one sentence how this relates"}\n'
        '  ]\n'
        '}'
    )


# ---------- Pydantic Models ----------
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


# ---------- Endpoints ----------
@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/api/chat", response_model=ChatResponse)
async def chat(request: ChatRequest):
    raw_text = ""
    try:
        # Step 1: Fetch all SOP docs from Google Drive
        service = get_drive_service()
        folder_id = get_sop_folder_id(service)
        if not folder_id:
            raise HTTPException(status_code=404, detail=f"Folder '{SOP_FOLDER_NAME}' not found.")
        all_docs = fetch_all_sops(service, folder_id)
        if not all_docs:
            raise HTTPException(status_code=404, detail="No .txt files found in DGS-SOPs folder.")

        # Build a lookup map: title -> full content
        doc_map = {doc["title"]: doc["content"] for doc in all_docs}
        all_titles = list(doc_map.keys())

        # Step 2: Select most relevant docs to include in prompt (for context)
        selected_docs = select_docs_for_prompt(request.query, all_docs)

        # Step 3: Build lean system prompt — asks Groq for titles only, not full content
        system_prompt = build_system_prompt(selected_docs, all_titles)

        # Step 4: Build messages list
        messages_list = []
        messages_list.append({"role": "system", "content": system_prompt})
        for msg in request.messages:
            messages_list.append({"role": str(msg.role), "content": str(msg.content)})
        messages_list.append({"role": "user", "content": str(request.query)})

        # Step 5: Call Groq — response is small now (just answer text + filenames)
        completion = groq_client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=messages_list,
            temperature=0.1,
            max_tokens=2048,
        )

        raw_text = completion.choices[0].message.content.strip()

        # Step 6: Extract JSON robustly
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

        # Step 7: Attach full document content from our local doc_map
        # Groq only returned titles — we look up the real content here
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
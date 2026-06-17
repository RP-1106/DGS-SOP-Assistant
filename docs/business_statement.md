# Business Statement
## DGS SOP Assistant — City of Los Angeles, Department of General Services

---

### Problem Statement

City of Los Angeles Department of General Services (DGS) employees regularly need to reference Standard Operating Procedures (SOPs) to perform their jobs correctly — whether procuring emergency supplies, reporting a workplace injury, requesting a city vehicle, or onboarding a new vendor.

Currently, these SOPs exist as static documents scattered across shared drives and internal portals. When an employee has a procedural question, they must:

1. Know which document to look for
2. Navigate to the correct folder or portal
3. Open and manually search through dense text files
4. Interrupt senior colleagues when they cannot find the answer

This process is slow, inconsistent, and error-prone. New employees are especially vulnerable — they frequently misfile requests, skip required forms, or follow outdated procedures because they did not know which document applied to their situation.

---

### Proposed Solution

The **DGS SOP Assistant** is an AI-powered internal chatbot that allows any DGS employee to ask a plain-English question and receive an immediate, cited answer drawn directly from the department's official SOP documents stored in Google Drive.

The assistant:
- Understands natural language questions ("How do I report a broken AC?")
- Fetches the official SOP library directly from Google Drive using the Drive REST API with OAuth 2.0
- Uses keyword-based relevance ranking to select the most pertinent documents for each query
- Returns a synthesized, accurate answer with the source document identified
- Shows the full source document in a side panel for verification
- Surfaces up to 5 additional related documents as clickable tabs
- Maintains full multi-turn conversation memory within a session

---

### Business Value

| Value Type | Description |
|---|---|
| **Time Savings** | Reduces average SOP lookup time from ~15 minutes to under 30 seconds per query |
| **Error Reduction** | Employees follow the correct, current procedure rather than guessing or using outdated documents |
| **Staff Efficiency** | Senior staff spend less time answering repetitive procedural questions from junior colleagues |
| **Onboarding Acceleration** | New employees become self-sufficient faster with an always-available procedural guide |
| **Compliance** | Reduces risk of non-compliant procurement, unreported incidents, or improperly onboarded vendors |
| **Scalability** | Adding new SOPs requires only uploading a `.txt` file to the Drive folder — no code changes needed |

---

### Target Users

- **Primary:** DGS employees at all levels performing day-to-day operational tasks
- **Secondary:** New hire onboarding cohorts requiring rapid procedural orientation
- **Tertiary:** Division Managers verifying procedural compliance across their teams

---

### Quantitative Business Case

- DGS manages operations for a department with hundreds of employees
- Conservative estimate: each employee spends ~30 minutes/week searching for procedural guidance
- At an average city employee hourly rate of ~$35/hour, this equals ~$17.50/employee/week in lost productivity
- Across 200 employees: **~$3,500/week or ~$182,000/year** in recoverable productivity
- The DGS SOP Assistant targets reducing this friction by 80%, representing **~$145,000/year in productivity savings** at minimal infrastructure cost

---

### Why This Matters for Agentic Engineering

This project demonstrates a core agentic pattern: a backend agent that is given a goal (answer a procedural question), autonomously retrieves relevant documents from Google Drive, ranks them by relevance, selects the most pertinent subset, synthesizes a grounded answer, and returns cited source documents — all without a human manually selecting or opening any file.

The same architecture generalizes immediately to any document repository — replacing Google Drive with SharePoint, a filesystem, or a company intranet — making this a reusable agentic blueprint for any organization with a document-based knowledge base.

**Note on API choice:** This project uses the Groq API (free tier, no credit card required) with the `llama-3.3-70b-versatile` model, and connects to Google Drive via the Drive REST API with OAuth 2.0. The submission requirement specifies "API/MCP" — this implementation uses the API pathway. The architecture is MCP-compatible and can be migrated to an MCP connector by swapping the Drive REST API calls for an MCP server without changing any other logic.

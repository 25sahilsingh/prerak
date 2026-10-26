# Prerak · प्रेरक

Prerak helps women and girls find government schemes they can actually apply for. It reads one research PDF (64 schemes, status as of 23 October 2026), lets someone browse them, and answers questions in Hindi, English, or Hinglish from that document only.

The chat model is not built in. Each visitor connects their own OpenAI-compatible model (Ollama, LM Studio, llama.cpp, vLLM, or a hosted API such as OpenRouter or Groq). Their settings stay in their browser and are sent with each request; the server does not save them.

Repository: [github.com/25sahilsingh/prerak](https://github.com/25sahilsingh/prerak)

Project write-up: [Prerak — Project Documentation](https://app.notion.com/p/Prerak-Project-Documentation-562849c2e1e143de9ee80636de2f4347)

## Requirements

- Node.js 20 or newer
- npm
- A compiler toolchain for `better-sqlite3` (`python3`, `make`, and `g++`). Most Linux desktops already have these.
- A model server on the same machine or on a private network. The app does not download a chat model.

## Run it for development

```bash
git clone https://github.com/25sahilsingh/prerak.git
cd prerak
cp .env.example .env.local
npm install
npm run dev
```

Open http://localhost:3000. The first start builds `data/app.db` from the PDF and downloads the embedding model (about 120 MB, a few minutes). Later starts skip that step when the database already has schemes.

Then open **Settings**, enter the model address, press **Test connection**, pick a model, and press **Save in this browser**.

## Run it for a demo or a single server

Prerak keeps its database in a file (`data/app.db`). Run one Node process on one machine. Do not deploy it as many serverless copies of the same app, or each copy would have its own database and they would not share schemes or chats.

```bash
cp .env.example .env.local
# Set ADMIN_PASSWORD in .env.local before sharing the server.
npm install
npm run build
npm start
```

`npm start` serves http://localhost:3000. Put a reverse proxy with HTTPS in front of it if other people will open it. The proxy must allow long responses: a Hindi answer can take a few minutes.

Set a long `ADMIN_PASSWORD` in `.env.local`. `/admin` rejects every upload when that variable is empty. Do not commit `.env.local`.

## Connect a model

In **Settings**, pick a preset or paste any base URL that ends in `/v1`:

| Server | Base URL | Start it with |
| --- | --- | --- |
| Ollama | `http://localhost:11434/v1` | `ollama pull qwen2.5:7b` |
| LM Studio | `http://localhost:1234/v1` | Developer tab, then Start Server |
| llama.cpp | `http://127.0.0.1:8080/v1` | `llama-server -m model.gguf --port 8080` |
| vLLM | `http://localhost:8000/v1` | `vllm serve <model> --port 8000` |

Add an API key only if that server asks for one. Settings are saved in the visitor's browser (`localStorage`), not on the server, so every visitor can use a different model. Visitors who have not connected one use `LLM_BASE_URL`, `LLM_MODEL`, and `LLM_API_KEY` from `.env.local`, if those are set. The operator's key is never sent to an address a visitor typed.

### On a hosted server

The server, not the visitor's browser, connects to the model. So on a public server, `localhost` means the server itself, and `npm start` refuses visitor addresses that point at localhost or a private network (10.x, 192.168.x, cloud metadata, and so on). Visitors can do one of two things:

- Use a hosted OpenAI-compatible API, such as OpenRouter (`https://openrouter.ai/api/v1`) or Groq (`https://api.groq.com/openai/v1`), with their own key.
- Expose their local model through a tunnel and paste the tunnel address with `/v1` added:

  ```bash
  cloudflared tunnel --url http://localhost:11434 --http-host-header localhost:11434   # Ollama
  cloudflared tunnel --url http://localhost:1234                                       # LM Studio
  ```

  Anyone with the tunnel address can use the model while the tunnel is running. For llama.cpp and vLLM, start the server with `--api-key` and enter the same key in Settings.

`npm run dev` allows private addresses so local development works with `localhost`. Set `ALLOW_PRIVATE_MODEL_URLS=true` only on a server that is not reachable from the internet.

For Hindi, use a multilingual 7B–9B model such as Qwen 2.5, Qwen 3, Llama 3.1, or Gemma. Hindi uses many more tokens than English, so a small device will be slow. Granite 4.2 8B on a Jetson Orin Nano (7.4 GB of memory) answered English in under a minute and Hindi in about 2.5–3 minutes, and its Hindi spelling was weak. That board was a test machine. It is not part of the app.

## What a visitor can do

- **Home.** Start a chat, or open Profile and Schemes.
- **Ask.** Streaming answers, conversation memory, starter questions, and a Stop button. Scrolling up while an answer is being written leaves the page where you put it.
- **Schemes.** Search, topic, status, and one button per state found in the database. A new PDF that contains another state adds that button. It is not a fixed list of states.
- **Scheme page.** Benefit, eligibility, documents, how to apply, and the official link from the PDF.
- **Profile.** Optional details (age, district, income, category, marital status, pregnancy, children, education, disability, work). The browser remembers only the profile id. There is no login.
- **Settings.** The visitor's own model address, key, and connection test, saved in their browser.

Answers cite scheme ids. Fake, discontinued, and not-in-force schemes are kept out of recommendations unless the person asks about that scheme by name. After each answer, links and helpline numbers are checked against the scheme data. A wrong or invented link is replaced or removed, and the screen shows an official-links box filled from the database.

## Update the schemes

Open `/admin`, enter `ADMIN_PASSWORD`, and upload a PDF. The file is saved to `data/uploads/schemes.pdf` and replaces the catalogue. The new PDF must include every scheme you still want. It must use the same layout: each scheme starts with an id such as `[UP-A01]` or `[BR-01]`, a `State:` field, and the same section headings (Benefit, Eligibility, Documents, How to apply, and so on).

Building the catalogue embeds every section on the server CPU. A file the size of the current PDF takes a few minutes.

If `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, and `CLOUDINARY_API_SECRET` are set, `/admin` also stores a copy of that PDF on Cloudinary. Chat and search do not read Cloudinary. They read `data/app.db`. Leave the Cloudinary variables empty if you do not want that copy.

You can also replace `Women_Schemes_UP_Women_Oct2026_RAG.pdf` and run `npm run ingest`. `npm run upload:pdf` sends the repo PDF to Cloudinary and does not rebuild the database.

## How an answer is made

```
PDF --> ingest --> SQLite (schemes, section chunks, FTS5 keyword index, embeddings)
question --> keyword search + meaning search, merged by reciprocal rank fusion
         --> boost schemes that match the saved profile
         --> hide fake or closed schemes unless the question names them
         --> prompt: rules, profile, summary of older turns, last 6 messages, top sections
         --> the operator's model, streamed
         --> link and number check --> answer
```

- Keyword search is SQLite FTS5. Meaning search embeds text with `Xenova/multilingual-e5-small` on the app machine and compares those vectors in process. There is no separate vector database.
- Hindi and Hinglish question words are also searched as English keywords, because the PDF is in English.
- With llama.cpp, the app renders the prompt through `/apply-template` and calls `/completion`, because that server's chat parser can stop in the middle of Hindi.
- After every 10 messages, older turns are folded into a short summary.
- The link check is `lib/rag/guard.ts`.

## Environment

Copy `.env.example` to `.env.local`.

| Variable | Required | Purpose |
| --- | --- | --- |
| `ADMIN_PASSWORD` | For `/admin` | Password for replacing the scheme PDF. Empty means nobody can upload. |
| `LLM_BASE_URL` | No | Default model for visitors who have not connected their own. Empty means none. |
| `LLM_MODEL` | No | Default model name. |
| `LLM_API_KEY` | No | Default model's key. It stays on the server. |
| `ALLOW_PRIVATE_MODEL_URLS` | No | `true` lets visitor addresses reach localhost and private networks. Unset means allowed in `npm run dev` and refused in `npm start`. |
| `CLOUDINARY_CLOUD_NAME` | No | Cloudinary cloud name. The API key and secret cannot replace it. |
| `CLOUDINARY_API_KEY` | No | Used only when uploading a PDF copy. |
| `CLOUDINARY_API_SECRET` | No | Used only when uploading a PDF copy. Never put this in the client or in git. |

## Checks

```bash
npm run typecheck
npm run check:guard   # the link checker, with no model running
npm run e2e           # the app must already be running, with LLM_BASE_URL set to a reachable model
```

The end-to-end check asks in English, Hindi, and Hinglish, checks a profile-based answer, checks that a follow-up still refers to the same scheme, and checks that no unverified link or number remains in the saved answer.

## Limits

- One server shares one scheme database, one model setting, and every saved profile. There is no account system. Do not put a private model key on a server you do not control. The key is stored in SQLite without encryption.
- The catalogue is only as current as the PDF. The copy in the repo is dated 23 October 2026. Confirm an application on the official `.gov.in` or `.nic.in` page.
- Prerak can misread eligibility. It is not a government decision.
- Voice input is not included.
- Cloudinary does not search the PDF and does not answer questions.

## Layout

| Path | Role |
| --- | --- |
| `app/page.tsx` | Home |
| `app/chat/page.tsx` | Ask |
| `app/schemes/` | Catalogue and scheme page |
| `app/profile/page.tsx` | Profile form |
| `app/settings/page.tsx` | Model connection |
| `app/admin/page.tsx` | PDF upload |
| `app/api/chat/route.ts` | Retrieval, streaming, and the link check |
| `scripts/ingest.ts` | PDF to SQLite |
| `lib/rag/` | Search, profile ranking, prompt, link check |
| `lib/llm.ts` | Model client |
| `data/app.db` | Created on the machine. Not in git. |

# 🧠 AI BRD Generator — DeepSeek V3.2

An AI-powered **Business Requirements Document (BRD) Generator** that takes unstructured inputs (Telegram chats, emails, meeting transcripts, client notes) and uses **DeepSeek V3.2** to:

1. **Extract** structured requirements (Functional, Non-Functional, Actors, Features)
2. **Classify** them using MoSCoW prioritization (Must/Should/Could/Won't Have)
3. **Generate** a professional, downloadable BRD (PDF)

---

## 🖥️ Tech Stack

| Layer             | Technology              |
|-------------------|-------------------------|
| **Frontend**      | Next.js 14 + React 18   |
| **Backend API**   | Next.js API Routes      |
| **AI / LLM**      | DeepSeek V3.2 API       |
| **Database**      | MongoDB (Mongoose)      |
| **PDF Export**     | html2canvas + jsPDF     |
| **Styling**       | Custom CSS (Dark Theme) |

---

## 🚀 Setup & Run Instructions

### Prerequisites
- **Node.js 18+** installed ([Download](https://nodejs.org/))
- **MongoDB** connection string (use [MongoDB Atlas](https://www.mongodb.com/atlas) for free cloud DB)
- **DeepSeek API Key** (get from [DeepSeek Platform](https://platform.deepseek.com/))

### Step 1: Install Dependencies

Open a terminal/command prompt in the project folder and run:

```bash
cd "c:\Users\Tejaswini Patil\OneDrive\SEM 4 CP\BRD_final"
npm install
```

### Step 2: Configure Environment Variables

Open the `.env.local` file in the project root and replace the placeholders:

```env
DEEPSEEK_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/brd_generator?retryWrites=true&w=majority
```

> **Note:** The app works in demo/mock mode even without these keys! You can test the UI immediately.

### Step 3: Run the App

```bash
npm run dev
```

This starts the development server. Open your browser and go to:

👉 **http://localhost:3000**

---

## 📱 Pages Overview

### 1. Dashboard (`/`)
- **Stats Row**: Messages processed, Requirements extracted, BRDs generated, NLP accuracy
- **Live Pipeline Status**: Visual 5-stage pipeline (Ingestion → NLP → LLM → DB → BRD)
- **Recent Messages Feed**: Cards showing processed inputs with tags and priority
- **MoSCoW Board**: 4-column prioritization board

### 2. Add Input (`/add-input`)
- **Source Selector**: Choose Telegram, Email, Meeting, or Notes
- **Text Input**: Paste unstructured text
- **3-Layer Processing Animation**:
  - Layer 1: Data Ingestion (receives text)
  - Layer 2: NLP Processing (tokenization, keyword extraction)
  - Layer 3: LLM Analysis (DeepSeek requirement extraction)
- **Results Panel**: Shows extracted actors, functional/non-functional requirements, features, MoSCoW, and ambiguities

### 3. BRD View (`/brd-view`)
- **Generate BRD**: Creates a professional BRD from all collected requirements
- **Full Document View**: Executive Summary, Scope, Actors table, Requirements tables, MoSCoW board, Assumptions, Constraints, Acceptance Criteria
- **Download PDF**: Export the visible BRD directly to PDF

---

## 🔧 Architecture — 3 Layers

```
┌──────────────────────────────────────────┐
│           LAYER 1: DATA INGESTION        │
│  Telegram · Email · Meeting · Notes      │
│  Source selection, text input, sender     │
└─────────────────┬────────────────────────┘
                  │
                  ▼
┌──────────────────────────────────────────┐
│    LAYER 2: DATA PROCESSING (NLP+LLM)   │
│  Tokenization · Keyword Extraction       │
│  DeepSeek V3.2 → Requirement Extraction  │
│  → Priority Detection → Ambiguity Check  │
└─────────────────┬────────────────────────┘
                  │
                  ▼
┌──────────────────────────────────────────┐
│        LAYER 3: BRD GENERATION           │
│  Full BRD Document with all sections     │
│  On-screen preview → PDF Download        │
│  Saved to MongoDB for history            │
└──────────────────────────────────────────┘
```

---

## 📁 Project Structure

```
BRD_final/
├── package.json
├── next.config.mjs
├── jsconfig.json
├── .env.local              ← Your API keys go here
├── README.md
└── src/
    ├── app/
    │   ├── globals.css      ← All styles (dark theme)
    │   ├── layout.js        ← Root layout
    │   ├── page.js          ← Dashboard
    │   ├── add-input/
    │   │   └── page.js      ← Data Ingestion page
    │   ├── brd-view/
    │   │   └── page.js      ← BRD Viewer + PDF export
    │   └── api/
    │       ├── process/
    │       │   └── route.js ← DeepSeek requirement extraction
    │       ├── generate-brd/
    │       │   └── route.js ← DeepSeek BRD generation
    │       └── brds/
    │           └── route.js ← Dashboard data API
    ├── lib/
    │   └── mongodb.js       ← MongoDB connection helper
    └── models/
        ├── Message.js       ← Message schema
        └── Brd.js           ← BRD document schema
```

---

## 🎨 Features

- ✅ Dark mode glassmorphism UI
- ✅ 3-layer processing pipeline visualization
- ✅ DeepSeek V3.2 NLP + requirement extraction
- ✅ MoSCoW prioritization (Must/Should/Could/Won't)
- ✅ Ambiguity detection
- ✅ Priority classification (High/Medium/Low)
- ✅ MongoDB persistent storage
- ✅ Full BRD preview before download
- ✅ PDF export
- ✅ Works in demo mode without API keys
- ✅ Responsive design (desktop + mobile)

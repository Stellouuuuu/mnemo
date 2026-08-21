# STELLA AI — Frontend

React + TypeScript + Vite.

## Scripts

```bash
npm install
npm run dev
npm run build
```

## Configuration

Copier `.env.example` vers `.env` si besoin :

```env
VITE_API_BASE_URL=http://localhost:3001
```

Par défaut : `http://localhost:3000` (aligné sur `backend/.env.example`).

## Structure

```text
src/
├── components/
│   ├── chat/       # ChatMessage, ChatInput, ChatWindow
│   └── layout/     # AppShell
├── pages/          # ChatPage
├── services/       # api.ts (fetch vers le backend)
└── types/          # types chat / API
```

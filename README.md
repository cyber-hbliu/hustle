# Hustle

> Job search tracker for workers — built for the people other tools leave behind.

Local-first, AI-powered, no subscription. Tracks what actually matters: union representation, visa sponsorship, worker protections, and community focus. Paste a job URL, get everything extracted. Generate cover letters that don't sound generic.

**[Live Demo →](https://cyber-hbliu.github.io/hustle/)** *(live after first deploy)*

---

## Why Hustle, not Huntr?

Huntr, Careerflow, LoopCV — they track status. They show you what you already know.

Hustle surfaces what they skip:

| Feature | Huntr / Careerflow | **Hustle** |
|---|---|---|
| Application status tracking | ✓ | ✓ |
| Notes per position | ✓ | ✓ |
| **Union detection** (AFSCME, SEIU, CWA, UAW…) | ✗ | ✓ |
| **Visa sponsorship** as a first-class field | ✗ | ✓ |
| **Worker protections** (EEO, ADA, fair chance, language access) | ✗ | ✓ |
| **Community focus** flagging | ✗ | ✓ |
| Two-step cover letter (fit analysis first, then letter) | ✗ | ✓ |
| Local-first — no account, no subscription | ✗ | ✓ |

---

## Three ways to use it

### (a) Use the hosted version
Visit the live demo above. No installation, no account.

### (b) Fork and deploy your own on GitHub Pages
1. Fork this repo
2. Go to your fork's **Settings → Pages**, set Source to **GitHub Actions**
3. Push any change to `main` — the workflow deploys automatically
4. Your URL: `https://<your-username>.github.io/hustle/`

### (c) Run locally
```bash
git clone https://github.com/cyber-hbliu/hustle.git
cd hustle
npm install
npm run dev
```
Open [http://localhost:5173](http://localhost:5173).

---

## Getting a Claude API key

Hustle works fully without an API key — manual entry, tracking, filtering, notes. Add a key to unlock auto-parsing from job URLs and AI cover letter generation.

1. Go to [console.anthropic.com](https://console.anthropic.com)
2. Create an account (new accounts get free credits)
3. Create a new API key
4. Paste it into Hustle's Settings panel — stored only in your browser, sent only to Anthropic's API

---

## Features

| | Without API key | With API key |
|---|---|---|
| Manual position entry | ✓ | ✓ |
| Status pipeline (Saved → Applied → Interview → Offer / Rejected) | ✓ | ✓ |
| Skills cloud + filtering | ✓ | ✓ |
| Notes, deadline countdowns | ✓ | ✓ |
| Union / sponsorship / community flags | ✓ | ✓ |
| Auto-parse from job URL | — | ✓ |
| Skills match analysis | — | ✓ |
| AI cover letter generation | — | ✓ |

---

## Privacy

All data lives in your browser's `localStorage`. No backend. No database. No analytics. Clearing your browser data removes everything.

---

## Tech stack

- React 18 + Vite 6
- Anthropic Claude API (direct browser calls, user-provided key)
- Pure CSS — no UI library
- GitHub Actions → GitHub Pages

---

## Philosophy

Built for workers navigating systems not designed for them — immigrants on OPT or H-1B, workers looking for union shops, people job searching in a second language. The tool tracks what matters to those workers, not just what's easy to build.

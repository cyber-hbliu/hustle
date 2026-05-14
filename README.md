# Hustle

> A job tracker for everyone who keeps meaning to apply.

Paste a job URL, get the whole thing structured — title, location, salary, duties, requirements, skills, all highlighted. No account. No subscription. No judgment.

**[Open Hustle →](https://cyber-hbliu.github.io/hustle/)**

---

## What it does

Drop a job URL into the bar at the top. Hustle scrapes the page and pulls out:

- **Description** — what the team does and what the role owns
- **Major Duties** — responsibilities as bullets, action verbs bolded
- **Requirements** — Required and Preferred qualifications split, degree and experience requirements bolded
- **Core Skills** — specific tools and technologies as chips
- **Location, salary, sponsorship status, union flag**

Can't paste a URL (LinkedIn, Indeed, company intranets)? Use the **+** button to paste the raw job text instead — same extraction, same structure.

Track each position through a pipeline: **Saved → Applied → Interview → Offer / Rejected**. Add a Claude API key in Settings to also get AI-powered match analysis and a generated cover letter.

---

## Your data stays on your device

All job data is stored in your **browser's localStorage** — nothing is sent to a server, nothing is synced to a cloud, and nobody else can see it.

This also means:
- **Phone and laptop are separate.** Jobs saved on your laptop won't appear on your phone and vice versa.
- **Different browsers on the same machine are separate.** Chrome and Safari don't share data.
- **Clearing browser data removes everything.** Export (not yet built) before you do that.

---

## Use it on your phone

There's no native app, but you can add Hustle to your home screen for a full-screen, app-like experience:

- **iPhone / iPad** — open [hustle](https://cyber-hbliu.github.io/hustle/) in Safari → tap the Share button → **Add to Home Screen**
- **Android** — open in Chrome → tap the three-dot menu → **Add to Home Screen** (or **Install App**)

It opens without the browser chrome and feels like a real app. Data lives on that device, separate from your laptop.

---

## Optional: Claude API key

Hustle works without an API key. Add one to unlock smarter extraction and cover letter generation.

1. Go to [console.anthropic.com](https://console.anthropic.com) — new accounts get free credits
2. Create an API key
3. Paste it into the **Settings** panel in Hustle — stored only in your browser, sent only to Anthropic

| | No key | With key |
|---|---|---|
| Paste URL → auto-extract | ✓ | ✓ (smarter) |
| Paste text → auto-extract | ✓ | ✓ (smarter) |
| Status pipeline | ✓ | ✓ |
| Duties / Requirements / Skills | ✓ | ✓ |
| Match analysis | — | ✓ |
| Cover letter generation | — | ✓ |

---

## Run locally

```bash
git clone https://github.com/cyber-hbliu/hustle.git
cd hustle
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173). Requires Node 20+.

---

## Deploy your own

1. Fork this repo
2. **Settings → Pages** → set Source to **GitHub Actions**
3. Push to `main` — deploys automatically
4. Your URL: `https://<your-username>.github.io/hustle/`

---

## Stack

React 18 · Vite 6 · Pure CSS · Jina AI Reader (free scraping) · Anthropic API (optional) · GitHub Actions → GitHub Pages

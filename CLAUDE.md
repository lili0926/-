# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Jasmine's Home** (a.k.a. "Aries") — a single-page companion web app. The user interacts with a persistent AI character ("Aries", 🦉) through chat, phone calls, diary, moments (朋友圈), tasks, and a novel reader. All UI is in Chinese.

No build system, no bundler, no framework. Pure vanilla HTML/CSS/JS served as static files.

## Architecture

### File Roles

| File | Role |
|---|---|
| `index.html` | All pages as `<section class="page" id="page-xxx">` inside two parallel theme containers: `#old-theme` (classic sidebar layout) and `#aries-theme` (mobile-phone mockup layout). Only one theme visible at a time. |
| `app.js` (~2700 lines) | Core logic: state management, page switching, AI chat, Supabase real-time listeners, tasks, diary, novel reader, moments, phone calls, weather, notifications, theme/wallpaper/UI presets. |
| `aries-init.js` (~570 lines) | Aries theme JS — runs as an IIFE appended conceptually after app.js. Manages tab switching (chat/moments/settings), 3-page horizontal swipe in moments, Aries-specific wallpaper and settings. |
| `style.css` | Classic ("old") theme styles. |
| `style-aries.css` | Aries theme styles. |
| `sw.js` | Service Worker for Android push notifications (Web Push) and offline caching. |
| `manifest.json` | PWA manifest — app name "Jasmine's Home", short name "Aries". |
| `api/Adapter.js` | Client-side AI request builder — dispatches to Anthropic or OpenAI-compatible API shape based on `baseUrl`. |
| `api/proxy.js` | Vercel-style serverless proxy (`export default async function handler(req, res)`) — forwards AI API calls to avoid CORS / key exposure. |

### Two Theme Systems

The app has two completely separate UIs rendered from the same HTML:

1. **Classic ("old")** — sidebar navigation with 9 pages: home, chat, tasks, novel, music, diary, callhome, settings, moments.
2. **Aries** — mobile-phone frame with 3 tabs (chat, moments, settings) and a 3-page horizontal swipe (主页/朋友圈/日记).

Theme switching: `changeTheme('old'|'aries')` toggles `#old-theme` / `#aries-theme` visibility. Persisted in `localStorage.activeTheme`. On load, the saved theme is restored.

### Data Layer

**Client-side (localStorage):**
- `state` object at top of app.js holds runtime state, initialized from localStorage on `init()`.
- Chat history, tasks, diaries, novel shelf, mood, quick notes, UI presets, wallpaper, API configs — all stored in localStorage.
- Keys pattern: direct names like `chatHistory`, `tasks`, `diaries`, `novelShelf`, `apiKey`, `bgAiApi`, `customAiApi`, `uiPreset`, `wallpaper`, `overlay`, `theme`, `activeTheme`, `nsfwMode`, `systemPrompt`, etc.

**Server-side (Supabase):**
- Project URL: `https://lqcuklhldvkwbkpftjzu.supabase.co` (hardcoded in app.js line 2).
- Client created via `@supabase/supabase-js` loaded from CDN in index.html.
- Tables used: `chat_messages`, `call_sessions`, `mem_diary`, `thoughts`, `moments`, `ai_messages`.
- Edge Functions invoked: `tts` (MiniMax TTS, returns hex-encoded audio), `send-ai-messages` (background AI message processing).
- Real-time listener on `call_sessions` for AI-initiated phone calls (INSERT events where `status === "calling"` and `call_type === "ai主动"`).

### Dual AI API Configuration

Two separate API configs exist to decouple cost:

1. **`aiApiConfig`** (chat) — user-configured in settings panel. Stored in `localStorage.customAiApi`. Used for interactive chat in `sendMessage()`.
2. **`bgApiConfig`** (background) — defaults to DeepSeek. Stored in `localStorage.bgAiApi`. Used for `triggerDailyPushMessage()`, `generateCallOpeningLine()`, and other background/autonomous AI tasks. Deliberately separate so chat quality isn't affected by cost-saving on background tasks.

Both go through `buildAIRequest()` in `api/Adapter.js` which dispatches based on whether `baseUrl` contains "anthropic" (Anthropic native API) or not (OpenAI-compatible format for DeepSeek, GLM, Grok, etc.).

### Key Subsystems

- **Chat** (`sendMessage`, `loadChatHistory`, `listenAIMessage`, `addChatMessage`): Messages go through Supabase `chat_messages` table with `status: "pending"`. Edge Function processes and responds. Client polls/listens for responses.
- **AI autonomous behavior** (`triggerDailyPushMessage`, `checkAwayTime`, `aiCallHome`): After user leaves for N hours (random 2-6), AI may send a push message or initiate a phone call. `checkAwayTime()` runs on page visibility change.
- **Phone calls** (`startCall`, `answerCall`, `endCall`): Simulated voice calls via Supabase `call_sessions`. AI generates opening line via `generateCallOpeningLine()`. TTS via MiniMax edge function.
- **Thoughts/Memory** (`generateThoughts`, `organizeMemory`, `loadThoughts`, `renderThoughts`): AI generates stream-of-consciousness "thoughts" that appear in the thought panel. `organizeMemory` categorizes past interactions.
- **Moments** (`loadMoments`, `publishMoment`): Social-media-style posts (朋友圈).
- **Memory diary** (`loadAndRenderMemDiary`, `openMemDayContent`): Categorized entries (about/nsfw/other) stored in Supabase `mem_diary` table. Separate from the local `diaries` in localStorage.
- **Tasks** (`renderTasks`, `addTask`, `toggleTask`, `deleteTask`): Local-only, stored in `localStorage.tasks`.
- **Novel reader** (`getShelf`, `saveShelf`, `openBook`, `renderNovelPage`): Local novel text stored in `localStorage.novelShelf`, split into pages of ~800 chars.
- **Weather** (`fetchWeather`): Uses city from settings, displayed on home page.
- **Notifications** (`requestNotificationPermission`, `sendLocalNotification`, `registerServiceWorker`): Web Push for Android background notifications.

### UI Presets

`UI_PRESETS` object (app.js ~line 383) defines visual themes: `ins-soft`, `night-glass`, `jasmine`, `daddy`, `frosted`, `rose-night`, `matcha-tea`, `aries`. Applied via `applyUIPreset(key)` which sets CSS custom properties.

### Initialization Order

1. Supabase client created (app.js line 1).
2. Real-time listener subscribed for `call_sessions` (app.js line 7).
3. `DOMContentLoaded` → API config panel bindings, `init()`.
4. `init()` → loads state from localStorage, calls `applyTheme`, `applyFont`, `applyWallpaper`, `applyUIPreset`, `updateGreeting`, `updateDate`, `fetchWeather`, `renderTasks`, `renderDiaries`, `loadChatHistory`, etc.
5. Aries theme: `aries-init.js` IIFE registers `window.changeTheme` wrapper, restores theme on load, sets up tab switching and swipe gestures.

## Conventions

- All UI text is in Chinese (Simplified).
- No module system — everything is global scope or inside IIFEs. Functions in app.js are globally accessible; aries-init.js uses an IIFE.
- `localStorage` is the primary persistence mechanism. Always check for existing `localStorage.getItem()` calls before adding new keys.
- Supabase operations use the `supabaseClient` global (created at top of app.js).
- Toast notifications: `showToast(msg)` for classic theme, `arToast(msg)` for Aries theme.
- HTML escaping: `escHtml(s)` utility used throughout.
- Dates: `today()` returns ISO date string. `new Date()` used directly for time context in AI prompts.

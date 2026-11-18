# VoIP frontend

React + TypeScript + Vite, React Router, shadcn/Radix and SIP.js 0.21.2.
The primary screen is a Messenger-style workspace: three rounded white islands
(conversation list, thread, person/shared-content panel) on a flat gray viewport.
The independent sidebar supports collapse/expand, an avatar account menu,
read-only account details and logout. Auth and communication notifications use
one shared toast system; technical connection state is kept out of the workspace.

## Run

```powershell
npm ci
Copy-Item .env.example .env
npm run dev
```

Open `http://localhost:5173`. Vite proxies `/api` to `http://localhost:8080`;
change `API_PROXY_TARGET` in `.env` for another backend. SIP credentials and the
WSS URL come from authenticated `GET /api/v1/sip/account`, never from browser
configuration. Keep secrets out of `VITE_*` variables.

### Access from other devices on the LAN

`npm run dev` listens on all network interfaces at port `5173`. On another
device on the same network, open `http://<frontend-machine-LAN-IP>:5173`.
Use `ipconfig` on the frontend machine to find its active adapter's IPv4 address.
Restart an already-running Vite process after changing its configuration.

Keep `VITE_API_BASE_URL` empty so browser API requests use `/api` through Vite;
`API_PROXY_TARGET=http://localhost:8080` still refers to the backend on the
frontend machine. Allow inbound TCP `5173` on the Windows Firewall private
network profile if other devices cannot connect.

After `npm run build`, `npm run preview` also listens on all interfaces at
`http://<frontend-machine-LAN-IP>:4173`. Preview does not proxy `/api`; use a
reachable backend URL with matching CORS or a production reverse proxy.

HTTP access through a LAN IP can display the app, but microphone/camera calls
require HTTPS with a certificate trusted by each client device. The PBX WSS
endpoint must also be reachable and trusted from those devices.

For production, leave `VITE_API_BASE_URL` empty and reverse-proxy `/api`, or set it
to the backend HTTPS origin and allow the exact frontend origin in backend CORS.
Serve `index.html` for `/login`, `/register` and `/messages`. Other paths redirect
to the main screen or login. Vite's development proxy is not part of the build.
Microphone/camera require HTTPS or localhost; WSS requires a trusted certificate.

## Application flows

- Register validates fields, handles conflicts and provisions through the backend,
  then returns to login. Ambiguous failures are not automatically retried.
- Login opens `/messages`. All other app functions live within Messenger;
  separate user-directory, call and connection screens have been removed.
- **Hội thoại mới** opens an integrated, searchable, paginated people picker.
  It excludes the caller, preserves blocked users as disabled entries, aborts
  outdated requests and supports retry. Choosing someone opens the conversation.
- Web chat supports offline delivery, unread counts and drafts. SIP MESSAGE
  supports text exchange with external SIP addresses.
  The accepted state means the backend stored a web message or SIP accepted a
  SIP MESSAGE. Failed sends keep the draft. Content renders as text.
- Voice/video calls start inside the conversation or person panel. The persistent
  call panel supports answering (including audio-only), declining, cancelling,
  ending, mic/camera toggles, elapsed time and manual media playback.
- The right island includes person details plus collapsible shared-photo/file
  sections with empty states. Messaging supports text and bundled stickers.
- Notifications float as Radix toasts, with close, keyboard/swipe support and
  appropriate retry actions. Field validation and message delivery icons remain
  attached to the content they describe. Connection loss offers reconnect through
  a toast; an online event can also retry. No user-facing SIP diagnostics screen.
- Avatar menu opens account details or logs out. The separate button beneath it
  collapses/expands the sidebar. Narrow layouts show one chat view at a time and
  open person details as a drawer.

The API does not supply online presence; account status and PBX extension
configuration are never presented as remote online registration.

## Session and communication lifetime

### Emoji, emotes and stickers

The smile button beside the composer opens searchable Emoji, Emote and Sticker
tabs. Emoji/emotes replace the current selection or insert at the caret; search
supports Vietnamese with or without accents. Emoji-only messages display larger.
The six built-in **Mầm nhỏ** stickers send immediately while preserving the text
draft. Failed sends leave the picker open so the user can retry.

The sticker body `[[voip:sticker:v1:wave]] 👋 Xin chào!` works in web chat and in
SIP `text/plain` messages. Exact known ID and fallback combinations in
`message-content.ts` render the bundled WebP art in VoIP. Other SIP clients
display the text body. Unknown versions, IDs, and malformed bodies stay plain text.
The conversation list shows the sticker's name; saved stickers render after login.

The image/file buttons are intentionally mocks. Clicking shows a toast that the
feature will be added later, without opening a file chooser or uploading data.
There is no attachment endpoint. The sticker asset, generation prompt and format
notes live in `src/assets/stickers/README.md`; the 241 KB atlas loads only when
sticker art is displayed.

### Authentication and persistence

Tokens, SIP secrets and drafts stay in RAM. **Reloading/closing the tab requires
a new login and can end the call.** Saved message history is restored from the
backend after login. There is no browser storage or refresh-token flow.

Messages between web accounts are stored in plaintext in PostgreSQL for both
participants before the sender sees success. Offline recipients see the message
after login. A visible session syncs every three seconds and checks again on
focus or network reconnect. Sending to an unmapped SIP address uses SIP MESSAGE.
Opening a thread loads 50 recent messages, with controls for older messages and
conversations. Restored pending SIP messages show an unknown sending outcome.

History failures keep messages visible and show a retry action. The queue retries
on an online event without sending another SIP MESSAGE. Failed saves/drafts are
only in RAM and disappear on reload/logout/closing; successfully saved messages
remain in the database. Details: `../backend-voip/docs/MESSAGE_HISTORY.md`.

Message and SIP providers plus media nodes remain mounted above the route outlet.
Opening menus/pickers, changing conversations or resizing the sidebar does not
recreate the SIP user agent. App authentication, SIP registration and call state
remain separate internally. Communication failure leaves app login and search
usable. Reconnect fetches fresh credentials and is blocked during an active call.

### Detached call window

Outgoing calls open a separate call window directly from the click. Incoming
calls also attempt to open it; when the browser blocks popups, the inline call
panel remains available with **Mở cửa sổ cuộc gọi**. The main window offers
**Xem cuộc gọi** and **Đưa về đây** while the panel is detached.

The call window is an empty same-origin document populated by a React portal.
It shares the opener's context and callbacks; it never boots another app,
fetches SIP credentials or creates/registers a SIP client. SIP.js and the audio
element stay in the main window. Video views share the existing media streams,
without cloning or stopping their tracks when the view moves.

Closing the call window returns the controls to the main window and keeps the
call running. Ending/rejecting/cancelling a call closes its detached window.
Logout, session expiry and closing/reloading the main window also dispose of
the child window; the call cannot outlive the main app. Popup presentation as a
window or tab depends on the browser. This does not remove the HTTPS requirement
for microphone/camera on LAN devices.

Expiry is checked by timer and focus/visibility changes. Authenticated HTTP 401
invalidates only the token used by that request. Logout immediately clears local
identity, pending requests, SIP/media, in-memory history and drafts while asking the backend
to revoke the captured token. Failed remote revocation is reported by toast.

## Source layout

| Location                                              | Responsibility                                                        |
| ----------------------------------------------------- | --------------------------------------------------------------------- |
| `src/components/ui/`                                  | shadcn/Radix controls and dialogs                                     |
| `src/components/app-ui.tsx`                           | Shared brand, avatar, input field and loading UI                      |
| `src/components/app-layout.tsx`, `account-menu.tsx`   | Sidebar, account menu and communication toast bridge                  |
| `src/components/toast-*`, `session-notifications.tsx` | Global toast lifecycle and auth-session notifications                 |
| `src/index.css`                                       | Shared tokens, auth/call styles and Messenger islands                 |
| `src/lib/brand.ts`, `contracts.ts`, `api.ts`          | Product identity, backend DTOs and HTTP handling                      |
| `src/features/auth/`                                  | In-memory identity, auth forms and protected layout                   |
| `src/features/users/`                                 | Integrated people picker and abortable search hook                    |
| `src/features/messages/`                              | Conversations, drafts, primary screen and person/shared-content panel |
| `src/features/sip/`                                   | Typed context, provider and POC calling/media adapter                 |

## Verification

```powershell
npm run build
npm run lint
npm test
powershell -ExecutionPolicy Bypass -File scripts/run-frontend-verification.ps1
```

The browser runner uses headless installed Google Chrome, fake media devices,
the real frontend and SIP.js, the contract-based HTTP mock and a local SIP proxy.
It starts/stops owned services on `14020`, `15061`, `15173`; it does not touch the
normal app on `5173`, live accounts or PBX extensions. Reports/screenshots are in
gitignored `output/playwright/`.

The runner covers blocked-popup inline behavior in `verify-frontend.mjs`, saved
history in `verify-history.mjs`, then
real detached windows in `verify-call-window.mjs`: incoming/outgoing controls,
duration, audio/video, moving the view without replacing streams or registering
again, decline/cancel/end, and logout cleanup. Call-window screenshots and the
dedicated `call-window-results.json` report are written to the same output folder.
Pass `-CallWindowOnly` to the PowerShell runner to run only the detached-window
scenarios, including child reload and main-app reload cleanup.
Pass `-ExpressionsOnly` to run seven emoji/emote/sticker groups, including caret
insertion, search/keyboard access, two-way send/history, fallback, mock attachments,
four responsive widths and failure/retry. Screenshots are `expressions-*.png`.
Pass `-HistoryOnly` to verify two-way SIP saves, reload/login, write retry,
pagination, read retry, the live-message/HTTP snapshot race and offline web chat.

The reusable Postman simulation is based on `../backend-voip/docs/openapi.yaml`.
Use `-UsePostman` to run it through the CLI. CLI 1.74.0's dataset daemon crashes
while initializing `pm.state` on this Windows environment, so the default runner
uses the same handler with a portable RAM adapter. No mock/workspace is published.

Validated 2026-11-18: build, 45 unit tests and 36 browser scenario groups (16 app,
7 history, 7 expressions, 6 detached-call groups) covering
island layout (1577/1440/1024/768/390), sidebar/account menu, picker search/paging,
toasts, SIP MESSAGE, failed sends/drafts, voice/video, mic/camera, reconnect,
active-call 401/logout, token expiry and local-state cleanup. No browser page
errors; lint has no errors and three existing shadcn/mobile-hook warnings.
Local browser checks do not establish deployed TLS, NAT/RTP, FusionPBX/Linphone
interop or physical-device playback; those still require a live test.

# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack
Electron 45 desktop app (Windows), plain HTML/CSS/JS renderer, no UI framework. Renderer files: src/renderer (index.html, style.css, app.js, sell.js, pay.js, settings.js). Preload-only API (window.api); contextIsolation on.

## Users
Cashiers (พนักงาน) at ร้านอึ้งลักเส็ง, a Thai grocery shop. They work on an ordinary Windows PC monitor with mouse, keyboard and a barcode scanner (not touch). Most input is a scan or typing; the mouse is secondary. Thai-speaking, varying computer confidence, often under queue pressure. Confirmed with the owner: PC monitor with mouse + keyboard + scanner.

## Product Purpose
Emergency POS used when the main Sea & Hill POS is down: keep selling, save every bill to disk, print the receipt, and later retype each bill's barcodes into the main POS. Success: a cashier can sell without training, never loses a bill, and understands every state at a glance.

## Positioning
Not a general POS; a small, fast, fail-safe fallback till that must be understandable by anyone in seconds.

## Operating Context
Flow (fixed): choose cashier → scan barcode / type name → cart → F11 "รับเงิน" → pay dialog (cash / transfer / government scheme) → bill saved to disk → receipt prints → new bill. Unknown barcode → add manually. Status bar shows cashier, machine ID, product count/age, pending bills, warnings. F11 is the pay hotkey (default menu removed so it is not fullscreen).

## Capabilities and Constraints
- The order of the sales steps must not change.
- The printed receipt (src/shared/receipt.js) must not be touched; only the on-screen UI changes.
- Keyboard-first: scan field always focused; F11 pays; must keep working with scanner typing fast.
- Only show what is needed during a sale; no extra data on the sell screen.
- UI language is Thai, large text and buttons. No framework, no external network at runtime (CSP default-src 'self'; fonts must be local files, no CDN).
- Do not change window.api contract or main-process code for visual work.

## Brand Commitments
Shop name ร้านอึ้งลักเส็ง / UNG LUK SENG. No logo or brand palette exists yet.

## Evidence on Hand
Current UI screenshots can be produced via `npm run harness:ui` (browser harness with mock API). No real customer/shop photos.

## Product Principles
1. Understand in one glance: one primary action per screen, plain Thai words.
2. Never lose a bill: state (saved / printed / failed) is always visible and honest.
3. Keyboard and scanner first; mouse is a fallback.
4. Calm and trustworthy over decorative; errors say what to do next.

## Accessibility & Inclusion
Large Thai text, strong contrast, clear focus rings, color never the only signal (status also has text/icon), Thai combining marks must not clip (generous line-height).

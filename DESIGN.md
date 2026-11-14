---
name: POS ฉุกเฉิน (Emergency POS)
description: Light, calm service-counter look for a Thai grocery till; one big total, one green next-action, a three-step strip.
colors:
  ground: "#f2f5f8"
  surface: "#ffffff"
  sunken: "#e9eef3"
  ink: "#12212e"
  muted: "#566879"
  line: "#d3dce5"
  navy: "#0e2a40"
  navy-2: "#163a56"
  navy-ink: "#e9f2f8"
  navy-muted: "#9db5c7"
  mint: "#7ff0b9"
  go: "#0b7a54"
  go-hover: "#086443"
  go-soft: "#e3f5ed"
  focus: "#1a64c0"
  warn: "#8a4b00"
  warn-soft: "#fff1d9"
  warn-line: "#e6b765"
  danger: "#b3261e"
  danger-soft: "#fdecea"
typography:
  display:
    fontFamily: "Leelawadee UI, Tahoma, Noto Sans Thai, sans-serif"
    fontSize: "4rem"
    fontWeight: 700
    lineHeight: 1.2
    fontFeature: "tnum"
  headline:
    fontFamily: "Leelawadee UI, Tahoma, Noto Sans Thai, sans-serif"
    fontSize: "1.9rem"
    fontWeight: 700
    lineHeight: 1.3
  title:
    fontFamily: "Leelawadee UI, Tahoma, Noto Sans Thai, sans-serif"
    fontSize: "1.2rem"
    fontWeight: 700
    lineHeight: 1.3
  body:
    fontFamily: "Leelawadee UI, Tahoma, Noto Sans Thai, sans-serif"
    fontSize: "18px"
    fontWeight: 400
    lineHeight: 1.55
  label:
    fontFamily: "Leelawadee UI, Tahoma, Noto Sans Thai, sans-serif"
    fontSize: "0.92rem"
    fontWeight: 700
    lineHeight: 1.55
rounded:
  sm: "8px"
  md: "10px"
  lg: "12px"
  xl: "16px"
  pill: "99px"
spacing:
  xs: "6px"
  sm: "10px"
  md: "16px"
  lg: "22px"
  xl: "32px"
components:
  button-go:
    backgroundColor: "{colors.go}"
    textColor: "#ffffff"
    rounded: "{rounded.md}"
    padding: "8px 20px"
    height: "48px"
  button-go-hover:
    backgroundColor: "{colors.go-hover}"
  button-default:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "8px 20px"
    height: "48px"
  button-pay:
    backgroundColor: "{colors.go}"
    textColor: "#ffffff"
    rounded: "14px"
    height: "84px"
  input-field:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "11px 14px"
  input-scan:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "14px"
    padding: "17px 20px 17px 62px"
  panel-total:
    backgroundColor: "{colors.navy}"
    textColor: "{colors.mint}"
    rounded: "{rounded.xl}"
    padding: "18px 22px 16px"
  chip-banknote:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    height: "44px"
  tag-attention:
    backgroundColor: "{colors.warn-soft}"
    textColor: "{colors.warn}"
    rounded: "{rounded.pill}"
---

# Design System: POS ฉุกเฉิน

## Overview

**Creative North Star: "The Counter Display"**

A bright service-counter screen: one big total readable from the customer's side, one green action that always means "next", and a three-step strip that says where the sale is. Everything else is quiet. The look borrows only type, palette, density and one signature move from queue-display signage; navigation and controls stay ordinary web controls a first-day cashier already understands.

It is an Operate surface for Thai cashiers on a PC monitor with mouse, keyboard and barcode scanner in a bright shop, so the ground is light and cool, text is large, and nothing competes with the scan field and the total.

**Key Characteristics:**
- Cool near-white ground, white work surfaces, deep navy for the shell and the total.
- Green is reserved for the next action; red only for destructive actions and errors; amber only for attention tags.
- Large tabular numerals for money; generous Thai line-height so tone marks never clip.
- Signature move: the total panel's numerals tick to the new amount when the cart changes (instant under reduced motion).

## Colors

A restrained, committed palette: navy carries the shell and total, green carries action, everything else is tinted neutral.

### Primary
- **Counter Green** (#0b7a54): the single go-colour: รับเงิน, ยืนยัน, เพิ่มเข้าบิล, saved/OK messages. White text on it is 5.4:1.
- **Display Mint** (#7ff0b9): numerals and the active step dot on navy only.

### Secondary
- **Deep Counter Navy** (#0e2a40) and **Navy Lift** (#163a56): top bar, total panel, avatar discs, "พอดี" chip.

### Tertiary
- **Attention Amber** (#8a4b00 on #fff1d9, line #e6b765): ฉุกเฉิน badge, "คีย์เอง"/"แก้ราคา" tags, stale-data warnings.
- **Stop Red** (#b3261e on #fdecea): ล้างบิล confirmation, errors, row-delete hover.
- **Focus Blue** (#1a64c0): keyboard focus rings and the scan field's focus.

### Neutral
- **Cool Ground** (#f2f5f8), **Paper White** (#ffffff), **Sunken Slate** (#e9eef3), **Ink** (#12212e), **Muted Slate** (#566879, 5.6:1 on white), **Hairline** (#d3dce5).

### Named Rules
**The One Go Rule.** Green appears on exactly one primary action per screen or dialog. If two things are green, one of them is wrong.
**The Navy Is Numbers Rule.** Mint numerals live only on navy; on white, money is Ink or Navy.

## Typography

**Display / Body / Label Font:** Leelawadee UI (with Tahoma, Noto Sans Thai). A system workhorse chosen for reliable Thai rendering offline; no web fonts (CSP is default-src 'self').

**Character:** Plain and legible. Weight and size, not different families, carry hierarchy.

### Hierarchy
- **Display** (700, 4rem, 1.2): the total only; tabular numerals.
- **Headline** (700, 1.9rem, 1.3): screen titles (staff welcome, settings).
- **Title** (700, 1.2rem): panel and dialog headings (dialogs 1.5rem).
- **Body** (400, 18px, 1.55): all running text; line-height never below 1.5 for Thai marks.
- **Label** (700, 0.92rem): field labels, table headers (0.85rem, muted).

### Named Rules
**The Tabular Money Rule.** Every amount uses tabular numerals and two decimals; columns of money must line up.

## Layout

Operate shell: fixed top bar, a two-column work area (flexible scan + cart | 360px sidebar with total, pay button, secondary actions), slim status footer. Spacing rhythm 6 / 10 / 16 / 22 / 32px. Below 1180px the sidebar narrows to 310px and step labels collapse to numbers except the active one. The scan field is always the first thing and always focused; the cart scrolls inside its own panel so the total and pay button never leave the screen.

## Elevation & Depth

Tonal layering plus one soft ambient shadow. Work surfaces sit on the ground with a hairline border and a faint shadow (`0 1px 2px rgba(14,42,64,.08), 0 4px 14px rgba(14,42,64,.06)`); dialogs lift with a deep soft shadow over a navy scrim (`0 28px 80px rgba(8,24,38,.45)`). The pay button carries a green-tinted drop (`0 6px 16px rgba(11,122,84,.28)`) only while enabled.

### Named Rules
**The Flat-Until-Enabled Rule.** A disabled action loses its shadow and drops to 45% opacity.

## Shapes

Soft but not toy-like: 10px controls, 12px panels, 16px total/staff cards, 18px dialogs, full pills for tags and step chips, circles for avatars and qty buttons. No borders thicker than 2px; no coloured side-stripes.

## Components

### Buttons
- **Shape:** 10px radius, 48px minimum height; the pay button is 84px, 14px radius.
- **Go (primary):** Counter Green fill, white 700 text; hover darkens to #086443; pressed nudges 1px down.
- **Default:** white with a hairline border; **Quiet:** transparent, muted text; **Danger:** Stop Red fill, used only on the clear-bill confirmation.
- **Focus:** 3px Focus Blue outline, 2px offset.

### Inputs / Fields
- 1.5px hairline border, 10px radius, white; focus swaps the border to Focus Blue with a soft 3px halo.
- Scan field: 1.45rem text, 14px radius, barcode icon at the left that turns blue on focus.
- In-cart numeric cells are ghost inputs (dashed underline, no box) so the cart reads as text until touched.

### Total Panel (signature)
Navy panel, 16px radius: small muted label, 4rem mint tabular total with a ฿ prefix at half weight, muted item/piece count. Numerals ease to the new value over 260ms.

### Steps strip
Three pills in the top bar: ① สแกนสินค้า ② รับเงิน ③ ใบเสร็จ. Active = mint dot + tinted pill; done = navy dot with mint number. Colour is never the only signal: the number and the label carry it.

### Pay dialog
Three method rows (เงินสด, เงินโอน/QR, โครงการรัฐ) with drawn icons; a row with a value turns green-tinted. Banknote chips (20/50/100/500/1,000/พอดี, 44px) set the cash amount. Change appears in a green-tinted bar.

### Cart rows
Name 700, price/qty/discount/total right-aligned tabular; qty has circular − / + (36px); delete is a 40px icon button; a newly added or changed row flashes mint and eases back.

## Do's and Don'ts

### Do:
- **Do** keep the scan field focused and the total visible at every viewport.
- **Do** say state in words ("บันทึกบิลแล้ว", "พิมพ์ไม่สำเร็จ — กดพิมพ์ซ้ำ"), with an icon or label beside any colour.
- **Do** keep Thai line-height ≥ 1.5 and test with tone-mark-heavy words.
- **Do** keep icons drawn, 2px stroke, one set.

### Don't:
- **Don't** add a second green action to a screen, or use red for anything but destructive/error.
- **Don't** reintroduce cream paper and red accents (the previous look) or a grey admin-panel look.
- **Don't** touch the receipt output (src/shared/receipt.js) when restyling.
- **Don't** load web fonts or remote assets (CSP is `default-src 'self'`).

### Mascot: Risu-san (ริสุซัง)
Shop mascot (red/gold squirrel), cropped from the brand sheet into `src/renderer/assets/mascot/` (native ~150px, so never scaled up). Used as a sticker, never as chrome: wave on the staff welcome (300px card), basket pose in the empty cart, thank-you pose after a sale (the empty state swaps via `Sell.updateEmpty`), megaphone chip on the update banner. Its red/gold is brand colour, not a UI colour: the One Go Rule and the navy/mint total are unchanged. Receipt output has no mascot.

### Scan status chip
Pill at the right of the scan field: green "พร้อมสแกน" when a scan will land, amber "คลิกช่องสแกน" / "คลิกที่หน้าต่างนี้" when it will not. State is always in words, not colour alone.

**Not canonized (carried by the build):** one-off values outside the tables: scrollbar thumb #b5c3cf, text selection #bfe0d1, 14px radius (scan field, pay button), 1.7rem pay-button label, .8rem key-cap; the `.view-staff` and empty-state illustrations are authored one-offs, not system components; the 1100px layout shows a horizontal scrollbar in the cart.

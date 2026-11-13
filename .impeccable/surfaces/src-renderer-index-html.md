---
version: 1
slug: "src-renderer-index-html"
primary_target: "src/renderer/index.html"
related_targets: []
---

# Surface brief: sell/pay/settings screens (Operate)

Mode: Operate. Audience: Thai grocery cashiers on a PC monitor with mouse, keyboard and barcode scanner, in a bright shop. Task: scan, check the cart, take payment, hand over a receipt, repeat, under queue pressure.

Untouched: order of sales steps, receipt output, window.api, F11 pay hotkey, scan field always focused. Wrong result: toy-like, cluttered with data, or anything that slows a scan-pay loop.

## Direction contract

THESIS: The screen reads like a service-counter queue display: one big total you can read from the customer side of the counter, and a three-step strip that always says where the sale is. It refuses the cream-paper-plus-red-accent "POS template" and a grey admin look.

OWN-WORLD: Cool near-white ground (#f3f6f9), white work surfaces, deep navy shell and total panel (#0e2a40), mint numerals on navy, one go-colour (green #0f8a5f) reserved for the next action (รับเงิน, ยืนยัน), amber for attention tags, red only for destructive and errors. Leelawadee UI, tabular numerals, generous Thai line-height. Drawn SVG icons, 2px stroke.

STORY: A cashier who never saw the app understands in one glance: scan here, total there, press the green button. Every state (saved, printed, failed, pending) is named in words.

FIRST VIEWPORT: Top bar (shop name + emergency badge, centered 3-step strip, cashier chip + settings). Left ~70%: large scan field with barcode icon, then the cart as clean rows (name, price x qty stepper, line total) or a friendly empty state. Right 340px: navy total panel with huge tabular numerals and item/piece count, the full-width green รับเงิน (F11) button beneath it, quieter ล้างบิล / พิมพ์ซ้ำ, message area. Slim status footer: products, pending bills, warnings.

FORM: Operate shell with standard controls; signature move is the total panel whose numerals tick to the new amount when the cart changes (reduced-motion: instant). Position 5 of my list: counter queue display. seed: fd036cfd86394cc7.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance.

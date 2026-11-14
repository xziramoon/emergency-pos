'use strict';
// Risu-san animation helpers. The idle loops (breathing, blink, tail, bob) are pure CSS;
// this file only handles the moments: click-to-greet and the thank-you burst.
const Mascot = {
  phrases: [
    'ยินดีต้อนรับสู่ร้านอึ้งลักเส็งนะคะ',
    'วันนี้ขายดีๆ นะคะ สู้ๆ!',
    'ริสุซังช่วยเฝ้าร้านให้ค่ะ',
    'ยิงบาร์โค้ดได้เลยค่ะ ทีละชิ้น',
  ],
  reduced: () => !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches),

  // Restart a one-shot CSS animation class on an element.
  play(el, cls) {
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
  },

  greet() {
    const stage = document.getElementById('mascot-hero');
    const bubble = document.getElementById('mascot-bubble');
    this.play(stage, 'is-hop');
    this.say = (this.say === undefined ? 0 : this.say + 1) % this.phrases.length;
    bubble.textContent = this.phrases[this.say];
    bubble.hidden = false;
    this.play(bubble, 'is-in');
    clearTimeout(this.bubbleTimer);
    this.bubbleTimer = setTimeout(() => { bubble.hidden = true; }, 3200);
  },

  // Little gold/red sparkles floating up from an element (after a sale).
  burst(el) {
    if (this.reduced()) return;
    const host = el.parentElement;
    const marks = ['✦', '♥', '✦', '♥', '✦'];
    marks.forEach((m, i) => {
      const s = document.createElement('span');
      s.className = 'spark ' + (m === '♥' ? 'spark-heart' : 'spark-star');
      s.textContent = m;
      s.setAttribute('aria-hidden', 'true');
      s.style.left = el.offsetLeft + el.offsetWidth / 2 - 12 + 'px';
      s.style.top = el.offsetTop + el.offsetHeight * 0.35 + 'px';
      s.style.setProperty('--dx', (i - 2) * 34 + 'px');
      s.style.animationDelay = i * 70 + 'ms';
      host.appendChild(s);
      setTimeout(() => s.remove(), 1500);
    });
  },

  init() {
    const stage = document.getElementById('mascot-hero');
    stage.addEventListener('click', () => this.greet());
  },
};
Mascot.init();

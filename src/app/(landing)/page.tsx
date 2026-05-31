"use client";

import { useEffect } from "react";
import "./landing-v3.css";

// 整頁 markup 原樣搬自 docs/20260531/DealerOS_Landing_v2.html（新版 v3）。
// 影片(3)/截圖(3) 已抽成實體檔放 public/landing/，避免 base64 撐爆 JS bundle。
// 互動（影片輪播 / DMS 時間軸滑入 / 打字機 / 痛點淡入 / 計數器）由下方 useEffect 接管。
// 唯一連動：footer「系統登入」連到 /login。
const LANDING_HTML = `
<!-- NAV -->
<nav>
  <a href="#" class="logo">DEALER<span>OS</span><sub>/ v3.0</sub></a>
  <div class="nav-status">ALL SYSTEMS OPERATIONAL</div>
  <ul class="nav-links">
    <li><a href="#pain">痛點</a></li>
    <li><a href="#dimensions">七維矩陣</a></li>
    <li><a href="#group">集團管控</a></li>
    <li><a href="#compare">對比</a></li>
    <li><a href="#cta" class="nav-cta">[ 預約說明 ]</a></li>
  </ul>
</nav>

<!-- HERO：三支影片輪播背景 -->
<section id="hero">
  <div class="video-bg">
    <video id="v0" class="active" autoplay muted playsinline loop preload="auto"
      src="/landing/landing-mp4-1.mp4"></video>
    <video id="v1" muted playsinline preload="auto"
      src="/landing/landing-mp4-2.mp4"></video>
    <video id="v2" muted playsinline preload="auto"
      src="/landing/landing-mp4-3.mp4"></video>
  </div>
  <div class="video-overlay"></div>

  <div class="hero-content">
    <div class="hero-badge">B2B2C · PREMIUM DEALER GROUP OS · v3.0</div>
    <h1 class="hero-title">
      <span class="t1">讓系統</span><br>
      <span class="t2">跟著你走</span>
    </h1>
    <div class="hero-tw" id="tw"><span class="cur"></span></div>
    <p class="hero-desc">
      專為 <strong>Premium 代理商集團</strong>打造的 B2B2C 管理作業系統。<br>
      由資深顧問實戰經驗提煉，以<strong>敏捷交付</strong>模式落地——<br>
      從授權框架到個人能效，四層組織一套系統貫通。
    </p>
    <div class="hero-btns">
      <a href="#cta" class="btn-g">[ 預約一對一說明 ]</a>
      <a href="#dimensions" class="btn-ghost">了解七維矩陣 →</a>
    </div>
  </div>

  <!-- 影片切換點 -->
  <div class="video-dots">
    <div class="vdot active"></div>
    <div class="vdot"></div>
    <div class="vdot"></div>
  </div>

  <div class="scroll-hint">
    <span>SCROLL</span>
    <div class="scroll-line"></div>
  </div>
</section>

<!-- 跑馬燈 -->
<div class="ticker-wrap">
  <div class="ticker">
    <span class="ticker-item"><span class="dot">◆</span>B2B2C 四層架構原生支援</span>
    <span class="ticker-item"><span class="dot">◆</span>系統跟著你走 — MOBILE FIRST</span>
    <span class="ticker-item"><span class="dot">◆</span>22 項 KPI 即時對標</span>
    <span class="ticker-item"><span class="dot">◆</span>個人能效散佈圖診斷</span>
    <span class="ticker-item"><span class="dot">◆</span>敏捷交付 · 核心模組優先上線</span>
    <span class="ticker-item"><span class="dot">◆</span>折扣授權框架 + 即時越界告警</span>
    <span class="ticker-item"><span class="dot">◆</span>資深顧問實戰經驗提煉</span>
    <span class="ticker-item"><span class="dot">◆</span>v3.0 ready for deployment</span>
    <span class="ticker-item"><span class="dot">◆</span>B2B2C 四層架構原生支援</span>
    <span class="ticker-item"><span class="dot">◆</span>系統跟著你走 — MOBILE FIRST</span>
    <span class="ticker-item"><span class="dot">◆</span>22 項 KPI 即時對標</span>
    <span class="ticker-item"><span class="dot">◆</span>個人能效散佈圖診斷</span>
    <span class="ticker-item"><span class="dot">◆</span>敏捷交付 · 核心模組優先上線</span>
    <span class="ticker-item"><span class="dot">◆</span>折扣授權框架 + 即時越界告警</span>
    <span class="ticker-item"><span class="dot">◆</span>資深顧問實戰經驗提煉</span>
    <span class="ticker-item"><span class="dot">◆</span>v3.0 ready for deployment</span>
  </div>
</div>

<!-- PAIN POINTS -->
<section id="pain">
  <div class="section-inner">
    <div class="pain-header">
      <p class="section-tag">// PAIN_POINTS</p>
      <h2 class="section-title">這些場景，<em>你是否似曾相識？</em></h2>
      <p class="section-body" style="margin:0 auto">這不是管理不夠努力，是工具不夠懂你。</p>
    </div>
    <div class="pain-grid">
      <div class="pain-card"><div class="pain-num">01 /</div><span class="pain-x">✕</span>
<svg viewBox="0 0 120 72" fill="none" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:72px;display:block;margin-bottom:.8rem;opacity:.85">
  <circle cx="36" cy="36" r="22" stroke="#00ff88" stroke-width="1.2" stroke-dasharray="4 2"/>
  <circle cx="36" cy="36" r="2" fill="#00ff88"/>
  <line x1="36" y1="36" x2="36" y2="18" stroke="#00ff88" stroke-width="1.5" stroke-linecap="round"/>
  <line x1="36" y1="36" x2="50" y2="40" stroke="#E07B39" stroke-width="1.5" stroke-linecap="round"/>
  <text x="28" y="64" font-family="JetBrains Mono,monospace" font-size="6" fill="rgba(0,255,136,0.5)">MONTHLY REPORT</text>
  <polyline points="72,20 84,35 94,28 106,50 118,45" stroke="#E07B39" stroke-width="1.5" fill="none" stroke-linecap="round"/>
  <polyline points="72,20 118,20 118,62 72,62 72,20" stroke="rgba(255,255,255,0.06)" stroke-width="1" fill="none"/>
  <text x="74" y="68" font-family="JetBrains Mono,monospace" font-size="5.5" fill="rgba(255,255,255,0.25)">-23% MOM</text>
</svg>
<p class="pain-text">集團總部想掌握各門店即時狀況，卻只能等月底報表開會，黃金介入時機早已錯失。</p></div>
      <div class="pain-card"><div class="pain-num">02 /</div><span class="pain-x">✕</span>
<svg viewBox="0 0 120 72" fill="none" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:72px;display:block;margin-bottom:.8rem;opacity:.85">
  <polygon points="36,8 60,52 12,52" stroke="#E07B39" stroke-width="1.5" fill="rgba(224,123,57,0.07)" stroke-linejoin="round"/>
  <text x="32" y="44" font-family="JetBrains Mono,monospace" font-size="18" fill="#E07B39" font-weight="700">!</text>
  <text x="10" y="65" font-family="JetBrains Mono,monospace" font-size="5.5" fill="rgba(224,123,57,0.5)">DISCOUNT BREACH</text>
  <path d="M80,10 L110,10 L110,42 Q95,58 80,42 Z" stroke="#00ff88" stroke-width="1.2" fill="rgba(0,255,136,0.04)"/>
  <line x1="86" y1="24" x2="104" y2="38" stroke="#E07B39" stroke-width="1.5" stroke-linecap="round"/>
  <line x1="104" y1="24" x2="86" y2="38" stroke="#E07B39" stroke-width="1.5" stroke-linecap="round"/>
</svg>
<p class="pain-text">某門店折扣超標損害品牌形象，發現時已為時已晚，代理商徒呼負負。</p></div>
      <div class="pain-card"><div class="pain-num">03 /</div><span class="pain-x">✕</span>
<svg viewBox="0 0 120 72" fill="none" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:72px;display:block;margin-bottom:.8rem;opacity:.85">
  <circle cx="32" cy="18" r="7" stroke="#00ff88" stroke-width="1.2"/>
  <path d="M20,48 Q32,30 44,48" stroke="#00ff88" stroke-width="1.2" fill="none"/>
  <line x1="32" y1="25" x2="32" y2="42" stroke="#00ff88" stroke-width="1.2"/>
  <line x1="32" y1="32" x2="24" y2="38" stroke="#00ff88" stroke-width="1.2"/>
  <line x1="32" y1="32" x2="40" y2="38" stroke="#00ff88" stroke-width="1.2"/>
  <rect x="52" y="8" width="2" height="56" fill="rgba(255,255,255,0.12)"/>
  <rect x="54" y="28" width="14" height="16" rx="2" stroke="rgba(255,255,255,0.2)" stroke-width="1" fill="none"/>
  <line x1="54" y1="8" x2="54" y2="64" stroke="rgba(255,255,255,0.06)" stroke-width="8"/>
  <polyline points="68,18 80,12 92,18 86,30 74,34 62,30 68,18" stroke="rgba(0,255,136,0.3)" stroke-width="1" fill="rgba(0,255,136,0.04)"/>
  <circle cx="80" cy="20" r="3" fill="rgba(0,255,136,0.5)"/>
  <polyline points="90,40 100,32 112,38 106,52 96,54 88,48 90,40" stroke="rgba(0,255,136,0.2)" stroke-width="1" fill="rgba(0,255,136,0.03)"/>
  <text x="56" y="68" font-family="JetBrains Mono,monospace" font-size="5.5" fill="rgba(0,255,136,0.35)">DATA LEAKED</text>
</svg>
<p class="pain-text">頂尖業務或服務顧問離職，客戶關係與作戰方法跟著消失，找不回來。</p></div>
      <div class="pain-card"><div class="pain-num">04 /</div><span class="pain-x">✕</span>
<svg viewBox="0 0 120 72" fill="none" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:72px;display:block;margin-bottom:.8rem;opacity:.85">
  <rect x="8" y="10" width="48" height="52" rx="2" stroke="rgba(255,255,255,0.15)" stroke-width="1" fill="rgba(255,255,255,0.03)"/>
  <line x1="8" y1="20" x2="56" y2="20" stroke="rgba(255,255,255,0.1)" stroke-width="1"/>
  <line x1="8" y1="30" x2="56" y2="30" stroke="rgba(255,255,255,0.1)" stroke-width="1"/>
  <line x1="8" y1="40" x2="56" y2="40" stroke="rgba(255,255,255,0.1)" stroke-width="1"/>
  <line x1="8" y1="50" x2="56" y2="50" stroke="rgba(255,255,255,0.1)" stroke-width="1"/>
  <line x1="28" y1="10" x2="28" y2="62" stroke="rgba(255,255,255,0.1)" stroke-width="1"/>
  <line x1="42" y1="10" x2="42" y2="62" stroke="rgba(255,255,255,0.1)" stroke-width="1"/>
  <circle cx="32" cy="36" r="18" stroke="#E07B39" stroke-width="2" fill="rgba(224,123,57,0.06)"/>
  <line x1="19" y1="23" x2="45" y2="49" stroke="#E07B39" stroke-width="2" stroke-linecap="round"/>
  <rect x="68" y="14" width="46" height="38" rx="2" stroke="#1a7a3a" stroke-width="1.2" fill="rgba(26,122,58,0.08)"/>
  <text x="74" y="28" font-family="JetBrains Mono,monospace" font-size="7" fill="#4ade80" font-weight="600">EXCEL</text>
  <line x1="74" y1="34" x2="108" y2="34" stroke="rgba(74,222,128,0.2)" stroke-width="1"/>
  <line x1="74" y1="40" x2="100" y2="40" stroke="rgba(74,222,128,0.2)" stroke-width="1"/>
  <line x1="74" y1="46" x2="104" y2="46" stroke="rgba(74,222,128,0.2)" stroke-width="1"/>
  <text x="10" y="70" font-family="JetBrains Mono,monospace" font-size="5.5" fill="rgba(224,123,57,0.5)">SYSTEM REJECTED</text>
</svg>
<p class="pain-text">花大錢導入系統，員工卻說「太難用，我還是用 Excel」，導入等於白做。</p></div>
      <div class="pain-card"><div class="pain-num">05 /</div><span class="pain-x">✕</span>
<svg viewBox="0 0 120 72" fill="none" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:72px;display:block;margin-bottom:.8rem;opacity:.85">
  <line x1="60" y1="8" x2="60" y2="56" stroke="rgba(255,255,255,0.2)" stroke-width="1.5"/>
  <circle cx="60" cy="8" r="3" fill="rgba(255,255,255,0.3)"/>
  <line x1="20" y1="28" x2="100" y2="20" stroke="#00ff88" stroke-width="1.5" stroke-linecap="round"/>
  <rect x="8" y="28" width="24" height="16" rx="2" stroke="#00ff88" stroke-width="1.2" fill="rgba(0,255,136,0.06)"/>
  <text x="12" y="39" font-family="JetBrains Mono,monospace" font-size="6" fill="#00ff88">直營</text>
  <rect x="88" y="20" width="24" height="16" rx="2" stroke="rgba(0,255,136,0.4)" stroke-width="1.2" fill="rgba(0,255,136,0.03)"/>
  <text x="91" y="31" font-family="JetBrains Mono,monospace" font-size="6" fill="rgba(0,255,136,0.5)">授權</text>
  <text x="16" y="56" font-family="JetBrains Mono,monospace" font-size="6" fill="#4ade80">HIGH</text>
  <text x="90" y="46" font-family="JetBrains Mono,monospace" font-size="6" fill="rgba(224,123,57,0.7)">LOW</text>
  <text x="18" y="68" font-family="JetBrains Mono,monospace" font-size="5.5" fill="rgba(255,255,255,0.2)">EXECUTION GAP</text>
</svg>
<p class="pain-text">無法同時掌控直營店與授權經銷商的執行落差，管太緊傷感情，放太鬆出問題。</p></div>
      <div class="pain-card"><div class="pain-num">06 /</div><span class="pain-x">✕</span>
<svg viewBox="0 0 120 72" fill="none" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:72px;display:block;margin-bottom:.8rem;opacity:.85">
  <line x1="12" y1="62" x2="108" y2="62" stroke="rgba(255,255,255,0.12)" stroke-width="1"/>
  <line x1="12" y1="10" x2="12" y2="62" stroke="rgba(255,255,255,0.12)" stroke-width="1"/>
  <circle cx="30" cy="45" r="4" fill="rgba(0,255,136,0.15)" stroke="rgba(0,255,136,0.3)" stroke-width="1"/>
  <circle cx="45" cy="30" r="4" fill="rgba(0,255,136,0.15)" stroke="rgba(0,255,136,0.3)" stroke-width="1"/>
  <circle cx="60" cy="50" r="4" fill="rgba(0,255,136,0.15)" stroke="rgba(0,255,136,0.3)" stroke-width="1"/>
  <circle cx="75" cy="20" r="4" fill="rgba(0,255,136,0.15)" stroke="rgba(0,255,136,0.3)" stroke-width="1"/>
  <circle cx="90" cy="38" r="4" fill="rgba(0,255,136,0.15)" stroke="rgba(0,255,136,0.3)" stroke-width="1"/>
  <line x1="20" y1="55" x2="100" y2="25" stroke="rgba(0,255,136,0.15)" stroke-width="1" stroke-dasharray="3 2"/>
  <rect x="8" y="6" width="104" height="60" fill="url(#fog)"/>
  <defs>
    <radialGradient id="fog" cx="50%" cy="50%" r="60%">
      <stop offset="0%" stop-color="rgba(10,17,32,0.0)"/>
      <stop offset="70%" stop-color="rgba(10,17,32,0.5)"/>
      <stop offset="100%" stop-color="rgba(10,17,32,0.85)"/>
    </radialGradient>
  </defs>
  <text x="38" y="42" font-family="JetBrains Mono,monospace" font-size="7" fill="rgba(255,255,255,0.15)">???</text>
  <text x="14" y="70" font-family="JetBrains Mono,monospace" font-size="5.5" fill="rgba(255,255,255,0.2)">NO VISIBILITY</text>
</svg>
<p class="pain-text">個人能效靠感覺判斷，全店平均數字掩蓋真相——不知道誰在撐、誰在拖。</p></div>
    </div>
    <p class="pain-closer">// 工具不對，<em>努力也會白費。</em></p>
  </div>
</section>

<!-- MANIFESTO -->
<section id="manifesto">
  <div class="section-inner">
    <div class="manifesto-grid">
      <div>
        <p class="section-tag">// PHILOSOPHY</p>
        <h2 class="manifesto-quote">
          <span class="hl">DealerOS 懂你</span><br>
          因為我們比你更早<br>想到你需要什麼
        </h2>
        <p class="manifesto-body">
          市場上的管理系統，設計邏輯是「你跟著系統走」。<br>
          DealerOS 相反——由資深顧問深入代理商集團實戰現場，<br>
          把管理智慧提煉進系統，再以 <strong>敏捷交付（Agile Delivery）</strong> 模式落地。<br><br>
          你上手的速度比想像快，<br>系統能支撐你成長的深度遠比想像的深。
        </p>
      </div>
      <div class="stats-grid">
        <div class="stat-card"><div class="stat-num"><span id="s1">0</span><sup>+</sup></div><div class="stat-lbl">管理功能模組<br>涵蓋集團到個人完整鏈路</div></div>
        <div class="stat-card"><div class="stat-num"><span id="s2">0</span></div><div class="stat-lbl">層組織架構貫通<br>OEM → 代理商 → 門店 → 個人</div></div>
        <div class="stat-card"><div class="stat-num"><span id="s3">0</span></div><div class="stat-lbl">項 KPI 即時對標<br>參考國際頂尖管理框架</div></div>
        <div class="stat-card"><div class="stat-num"><span id="s4">0</span></div><div class="stat-lbl">個管理維度<br>從角色權限到風險預警</div></div>
      </div>
    </div>
  </div>
</section>

<!-- 7 DIMENSIONS -->
<section id="dimensions">
  <div class="section-inner">
    <div class="dim-header">
      <p class="section-tag">// SEVEN_DIMENSIONS</p>
      <h2 class="section-title">七個維度，<em>貫通每一層決策</em></h2>
      <p class="section-body">不是功能清單，是一套完整的管理方法論。每個維度對應一個真實的管理痛點。</p>
    </div>
    
<svg viewBox="0 0 680 680" style="width:100%;max-width:680px;display:block;margin:0 auto 3rem">
<ellipse cx="340" cy="340" rx="265" ry="240" stroke="rgba(255,255,255,0.025)" stroke-width="1" stroke-dasharray="3 6" fill="none" transform="rotate(-12,340,340)"/>
<line x1="340" y1="295" x2="340" y2="176"  stroke="rgba(0,221,110,0.18)"   stroke-width="1" stroke-dasharray="5 3"/>
<line x1="375" y1="307" x2="519" y2="186"  stroke="rgba(34,180,255,0.18)"  stroke-width="1" stroke-dasharray="5 3"/>
<line x1="384" y1="340" x2="534" y2="340"  stroke="rgba(162,89,255,0.18)"  stroke-width="1" stroke-dasharray="5 3"/>
<line x1="368" y1="373" x2="445" y2="522"  stroke="rgba(255,100,100,0.18)" stroke-width="1" stroke-dasharray="5 3"/>
<line x1="318" y1="374" x2="200" y2="492"  stroke="rgba(255,180,0,0.18)"   stroke-width="1" stroke-dasharray="5 3"/>
<line x1="293" y1="335" x2="152" y2="310"  stroke="rgba(255,140,60,0.18)"  stroke-width="1" stroke-dasharray="5 3"/>
<line x1="308" y1="308" x2="172" y2="170"  stroke="rgba(0,212,170,0.18)"   stroke-width="1" stroke-dasharray="5 3"/>
<circle cx="340" cy="340" r="58" fill="rgba(0,221,110,0.06)" stroke="rgba(0,221,110,0.28)" stroke-width="1.5"/>
<circle cx="340" cy="340" r="48" fill="rgba(8,13,20,0.97)"/>
<text x="340" y="331" text-anchor="middle" font-family="JetBrains Mono,monospace" font-size="14" font-weight="700" fill="#ffffff">DEALER</text>
<text x="340" y="350" text-anchor="middle" font-family="JetBrains Mono,monospace" font-size="14" font-weight="700" fill="#00dd6e">OS</text>
<text x="340" y="364" text-anchor="middle" font-family="JetBrains Mono,monospace" font-size="6.5" fill="rgba(255,255,255,0.2)">7 DIMENSIONS</text>
<circle cx="340" cy="130" class="g0" stroke="#00dd6e" stroke-width="2.5" fill="none"/>
<circle cx="340" cy="130" r="44" stroke="#00dd6e" stroke-width="1.8" fill="rgba(8,13,20,0.95)" class="b0"/>
<text x="340" y="120" text-anchor="middle" font-family="JetBrains Mono,monospace" font-size="14" font-weight="700" fill="#00dd6e">P-08</text>
<text x="340" y="137" text-anchor="middle" font-family="JetBrains Mono,monospace" font-size="12" fill="rgba(255,255,255,0.92)">角色與權限</text>
<text x="340" y="153" text-anchor="middle" font-family="JetBrains Mono,monospace" font-size="8.5" fill="#00dd6e">✓ 全功能完成</text>
<circle cx="563" cy="158" class="g1" stroke="#22b4ff" stroke-width="2.5" fill="none"/>
<circle cx="563" cy="158" r="48" stroke="#22b4ff" stroke-width="1.8" fill="rgba(8,13,20,0.95)" class="b1"/>
<text x="563" y="147" text-anchor="middle" font-family="JetBrains Mono,monospace" font-size="14" font-weight="700" fill="#22b4ff">PULS</text>
<text x="563" y="164" text-anchor="middle" font-family="JetBrains Mono,monospace" font-size="12" fill="rgba(255,255,255,0.92)">即時洞察</text>
<text x="563" y="180" text-anchor="middle" font-family="JetBrains Mono,monospace" font-size="8.5" fill="#22b4ff">✓ 全功能完成</text>
<circle cx="580" cy="340" class="g2" stroke="#a259ff" stroke-width="2.5" fill="none"/>
<circle cx="580" cy="340" r="44" stroke="#a259ff" stroke-width="1.8" fill="rgba(8,13,20,0.95)" class="b2"/>
<text x="580" y="329" text-anchor="middle" font-family="JetBrains Mono,monospace" font-size="14" font-weight="700" fill="#a259ff">D-Flow</text>
<text x="580" y="346" text-anchor="middle" font-family="JetBrains Mono,monospace" font-size="12" fill="rgba(255,255,255,0.92)">流程自動化</text>
<text x="580" y="362" text-anchor="middle" font-family="JetBrains Mono,monospace" font-size="8.5" fill="#a259ff">✓ 全功能完成</text>
<circle cx="445" cy="572" class="g3" stroke="#ff6464" stroke-width="2.5" fill="none"/>
<circle cx="445" cy="572" r="42" stroke="#ff6464" stroke-width="1.8" fill="rgba(8,13,20,0.95)" class="b3"/>
<text x="445" y="561" text-anchor="middle" font-family="JetBrains Mono,monospace" font-size="14" font-weight="700" fill="#ff6464">V-Score</text>
<text x="445" y="578" text-anchor="middle" font-family="JetBrains Mono,monospace" font-size="11" fill="rgba(255,255,255,0.92)">客戶價值管理</text>
<text x="445" y="594" text-anchor="middle" font-family="JetBrains Mono,monospace" font-size="8.5" fill="#ff6464">✓ 全功能完成</text>
<circle cx="200" cy="520" class="g4" stroke="#ffb400" stroke-width="2.5" fill="none"/>
<circle cx="200" cy="520" r="46" stroke="#ffb400" stroke-width="1.8" fill="rgba(8,13,20,0.95)" class="b4"/>
<text x="200" y="508" text-anchor="middle" font-family="JetBrains Mono,monospace" font-size="14" font-weight="700" fill="#ffb400">G-Sync</text>
<text x="200" y="525" text-anchor="middle" font-family="JetBrains Mono,monospace" font-size="11" fill="rgba(255,255,255,0.92)">集團戰略同步</text>
<text x="200" y="541" text-anchor="middle" font-family="JetBrains Mono,monospace" font-size="8.5" fill="#ffb400">✓ 全功能完成</text>
<circle cx="98"  cy="318" class="g5" stroke="#ff8c3c" stroke-width="2.5" fill="none"/>
<circle cx="98"  cy="318" r="44" stroke="#ff8c3c" stroke-width="1.8" fill="rgba(8,13,20,0.95)" class="b5"/>
<text x="98"  y="306" text-anchor="middle" font-family="JetBrains Mono,monospace" font-size="11" font-weight="700" fill="#ff8c3c">R-Horizon</text>
<text x="98"  y="323" text-anchor="middle" font-family="JetBrains Mono,monospace" font-size="12" fill="rgba(255,255,255,0.92)">風險預警</text>
<text x="98"  y="339" text-anchor="middle" font-family="JetBrains Mono,monospace" font-size="8.5" fill="#ff8c3c">✓ 全功能完成</text>
<circle cx="128" cy="126" class="g6" stroke="#00d4aa" stroke-width="2.5" fill="none"/>
<circle cx="128" cy="126" r="42" stroke="#00d4aa" stroke-width="1.8" fill="rgba(8,13,20,0.95)" class="b6"/>
<text x="128" y="115" text-anchor="middle" font-family="JetBrains Mono,monospace" font-size="11" font-weight="700" fill="#00d4aa">E-Pulse</text>
<text x="128" y="132" text-anchor="middle" font-family="JetBrains Mono,monospace" font-size="12" fill="rgba(255,255,255,0.92)">彈性擴容</text>
<text x="128" y="148" text-anchor="middle" font-family="JetBrains Mono,monospace" font-size="8.5" fill="#00d4aa">✓ 全功能完成</text>
</svg>
    <div class="dim-list">
      <div class="dim-item"><div class="dim-n">01 /</div><div><div class="dim-name">角色與權限</div><div class="dim-desc">代理商看全部，門店只看自己——安全邊界由系統守住，不靠人工管控。資料存取依組織層級自動篩選，杜絕越權與資料洩漏。</div></div></div>
      <div class="dim-item"><div class="dim-n">02 /</div><div><div class="dim-name">即時洞察</div><div class="dim-desc">讓盲點無所遁形。每一個異常在它釀成問題之前就被看見——快速指標每 15 分鐘更新，主管介入從月底縮短到當天。</div></div></div>
      <div class="dim-item"><div class="dim-n">03 /</div><div><div class="dim-name">流程自動化</div><div class="dim-desc">告別卡頓，工作流自動導航。從接待到交車，每一步都有系統銜接，不靠人工傳遞，不因人員異動而斷鏈。</div></div></div>
      <div class="dim-item"><div class="dim-n">04 /</div><div><div class="dim-name">客戶價值管理</div><div class="dim-desc">精準服務送到心坎裡。每位客戶的偏好、歷程與價值完整留在系統裡——人走資料不走，頂尖業務的方法論成為組織資產。</div></div></div>
      <div class="dim-item"><div class="dim-n">05 /</div><div><div class="dim-name">集團戰略同步</div><div class="dim-desc">全店同步，戰略一體。代理商的每一個決策即時落地到每一家門店——折扣政策、促銷活動、KPI 目標，一個動作全面生效。</div></div></div>
      <div class="dim-item"><div class="dim-n">06 /</div><div><div class="dim-name">風險預警</div><div class="dim-desc">問題發生前先按防護盾。折扣越界、客戶流失風險、庫存告警——系統主動推送，代理商永遠比問題先一步。</div></div></div>
      <div class="dim-item"><div class="dim-n">07 /</div><div><div class="dim-name">彈性擴容</div><div class="dim-desc">尖峰時服務不降級。敏捷架構支援業務成長，三層或四層組織隨需切換，系統跟著你的規模長大，不需重新導入。</div></div></div>
    </div>
  </div>
</section>

<!-- GROUP LAYER -->
<section id="group">
  <div class="section-inner">
    <div class="group-header">
      <p class="section-tag">// GROUP_MANAGEMENT</p>
      <h2 class="section-title">業界唯一：<em>四層全貫通</em></h2>
      <p class="section-body">傳統管理系統的設計終點是「門店」。DealerOS 從代理商集團的視角出發，讓每一層都有對應的管理工具。</p>
    </div>
    <div style="display:flex;gap:3rem;align-items:flex-start;margin-bottom:4.5rem;flex-wrap:wrap">
    <div class="layers">
      <div class="layer"><div class="layer-card l1"><div class="layer-name">代理商總部</div>
    <div style="flex:1;min-width:280px;display:flex;align-items:center;justify-content:center;">

<svg viewBox="0 0 220 440" style="width:200px;flex-shrink:0">
<defs>
  <marker id="am" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
    <path d="M2 1L8 5L2 9" fill="none" stroke="context-stroke" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
  </marker>
</defs>
<!-- 中軸 -->
<line x1="110" y1="46" x2="110" y2="398" stroke="rgba(255,255,255,0.05)" stroke-width="1.5" stroke-dasharray="5 4"/>
<!-- L1 綠 -->
<circle cx="110" cy="56" r="30" fill="rgba(0,221,110,0.06)" class="pb1"/>
<circle cx="110" cy="56" r="21" fill="rgba(0,221,110,0.1)" stroke="#00dd6e" stroke-width="1.6"/>
<polygon points="100,64 100,50 105,56 110,48 115,56 120,50 120,64" fill="none" stroke="#00dd6e" stroke-width="1.3" stroke-linejoin="round"/>
<rect x="99" y="62" width="22" height="3" rx="1" fill="#00dd6e" opacity="0.7"/>
<text x="110" y="96" text-anchor="middle" font-family="JetBrains Mono,monospace" font-size="10.5" font-weight="700" fill="#00dd6e">代理商總部</text>
<text x="110" y="110" text-anchor="middle" font-family="JetBrains Mono,monospace" font-size="7.5" fill="rgba(255,255,255,0.35)">授權框架 · 集團戰略</text>
<!-- 箭頭1 -->
<g class="ab1"><line x1="110" y1="118" x2="110" y2="138" stroke="#00dd6e" stroke-width="1.6" marker-end="url(#am)"/></g>
<!-- L2 藍 -->
<circle cx="110" cy="154" r="30" fill="rgba(34,180,255,0.06)" class="pb2"/>
<circle cx="110" cy="154" r="21" fill="rgba(34,180,255,0.1)" stroke="#22b4ff" stroke-width="1.6"/>
<rect x="100" y="146" width="20" height="15" rx="1" fill="none" stroke="#22b4ff" stroke-width="1.2"/>
<line x1="98" y1="146" x2="110" y2="139" stroke="#22b4ff" stroke-width="1.1"/>
<line x1="122" y1="146" x2="110" y2="139" stroke="#22b4ff" stroke-width="1.1"/>
<rect x="104" y="151" width="5" height="6" rx="1" fill="none" stroke="#22b4ff" stroke-width="1"/>
<rect x="111" y="151" width="5" height="6" rx="1" fill="none" stroke="#22b4ff" stroke-width="1"/>
<text x="110" y="194" text-anchor="middle" font-family="JetBrains Mono,monospace" font-size="9" font-weight="700" fill="#22b4ff">直營 / 授權經銷商</text>
<text x="110" y="207" text-anchor="middle" font-family="JetBrains Mono,monospace" font-size="7.5" fill="rgba(255,255,255,0.35)">執行 · 越界即時告警</text>
<!-- 箭頭2 -->
<g class="ab2"><line x1="110" y1="215" x2="110" y2="235" stroke="#22b4ff" stroke-width="1.6" marker-end="url(#am)"/></g>
<!-- L3 紫 -->
<circle cx="110" cy="251" r="30" fill="rgba(162,89,255,0.06)" class="pb3"/>
<circle cx="110" cy="251" r="21" fill="rgba(162,89,255,0.1)" stroke="#a259ff" stroke-width="1.6"/>
<rect x="102" y="243" width="8" height="7" rx="1" fill="none" stroke="#a259ff" stroke-width="1.1"/>
<rect x="112" y="243" width="8" height="7" rx="1" fill="none" stroke="#a259ff" stroke-width="1.1"/>
<rect x="102" y="252" width="8" height="7" rx="1" fill="none" stroke="#a259ff" stroke-width="1.1"/>
<rect x="112" y="252" width="8" height="7" rx="1" fill="none" stroke="#a259ff" stroke-width="1.1"/>
<text x="110" y="291" text-anchor="middle" font-family="JetBrains Mono,monospace" font-size="10.5" font-weight="700" fill="#a259ff">門店各部門</text>
<text x="110" y="305" text-anchor="middle" font-family="JetBrains Mono,monospace" font-size="7.5" fill="rgba(255,255,255,0.35)">銷售 · 售後 · 庫存</text>
<!-- 箭頭3 -->
<g class="ab3"><line x1="110" y1="313" x2="110" y2="333" stroke="#a259ff" stroke-width="1.6" marker-end="url(#am)"/></g>
<!-- L4 琥珀 -->
<circle cx="110" cy="349" r="30" fill="rgba(255,180,0,0.06)" class="pb4"/>
<circle cx="110" cy="349" r="21" fill="rgba(255,180,0,0.1)" stroke="#ffb400" stroke-width="1.6"/>
<circle cx="110" cy="340" r="5.5" fill="none" stroke="#ffb400" stroke-width="1.2"/>
<path d="M99,358 Q110,349 121,358" fill="none" stroke="#ffb400" stroke-width="1.2" stroke-linecap="round"/>
<text x="110" y="389" text-anchor="middle" font-family="JetBrains Mono,monospace" font-size="10.5" font-weight="700" fill="#ffb400">個人</text>
<text x="110" y="403" text-anchor="middle" font-family="JetBrains Mono,monospace" font-size="7.5" fill="rgba(255,255,255,0.35)">業務員 · SA · 技師</text>
<!-- 底部 -->
<text x="110" y="430" text-anchor="middle" font-family="JetBrains Mono,monospace" font-size="6.5" fill="rgba(255,255,255,0.15)">// ONE SYSTEM</text>
</svg>
</div>
  </div>
  <div class="hl-grid">
      <div class="hl-card" style="padding:0;overflow:hidden">
        <div style="position:relative;background:#0a1628">
          <img src="/landing/landing-png-1.png" style="width:100%;height:160px;object-fit:cover;object-position:top;display:block;opacity:0.85"/>
          <div style="position:absolute;bottom:0;left:0;right:0;height:60px;background:linear-gradient(0deg,rgba(10,17,32,1) 0%,transparent 100%)"></div>
        </div>
        <div style="padding:1.2rem 1.4rem 1.4rem">
          <div class="hl-title">集團即時儀表板</div>
          <div class="hl-body">每天早上一頁，掌握全部門店的銷售達成、售後品質與健康狀態。不等月底，不開會，異常門店主動推送。</div>
        </div>
      </div>
      <div class="hl-card" style="padding:0;overflow:hidden">
        <div style="position:relative;background:#0a1628">
          <img src="/landing/landing-png-2.png" style="width:100%;height:160px;object-fit:cover;object-position:top;display:block;opacity:0.85"/>
          <div style="position:absolute;bottom:0;left:0;right:0;height:60px;background:linear-gradient(0deg,rgba(10,17,32,1) 0%,transparent 100%)"></div>
        </div>
        <div style="padding:1.2rem 1.4rem 1.4rem">
          <div class="hl-title">個人能效散佈圖</div>
          <div class="hl-body">平均值說謊，散佈圖才說真話。業界首創下探到每一個人的診斷視角——誰在撐、誰需要輔導，一眼看穿。</div>
        </div>
      </div>
      <div class="hl-card" style="padding:0;overflow:hidden">
        <div style="position:relative;background:#0a1628">
          <img src="/landing/landing-png-3.png" style="width:100%;height:160px;object-fit:cover;object-position:top;display:block;opacity:0.85"/>
          <div style="position:absolute;bottom:0;left:0;right:0;height:60px;background:linear-gradient(0deg,rgba(10,17,32,1) 0%,transparent 100%)"></div>
        </div>
        <div style="padding:1.2rem 1.4rem 1.4rem">
          <div class="hl-title">折扣授權管控</div>
          <div class="hl-body">代理商設定授權框架，門店在範圍內執行，越界即時標示。品牌定價紀律不靠人工盯，系統自動守住。</div>
        </div>
      </div>
    </div>
    </div>
</section>

<!-- COMPARE -->
<section id="compare">
  <div class="section-inner">
    <div class="compare-hdr">
      <p class="section-tag">// COMPARISON</p>
      <h2 class="section-title">傳統 DMS，管好一家店。<br><em>DealerOS，管好整個網絡。</em></h2>
    </div>
    <table class="compare-table">
      <thead><tr><th></th><th class="th-comp">傳統 DMS</th><th class="th-dos">DealerOS v3.0</th></tr></thead>
      <tbody>
        <tr><td>設計對象</td><td>單一門店作業人員</td><td class="td-dos"><span class="ck">✓</span> 代理商集團管理層 + 門店</td></tr>
        <tr><td>組織視野</td><td>門店內部</td><td class="td-dos"><span class="ck">✓</span> 集團→門店→個人，四層貫通</td></tr>
        <tr><td>KPI 管理</td><td>附加報表功能</td><td class="td-dos"><span class="ck">✓</span> 22 項指標即時對標，核心設計</td></tr>
        <tr><td>折扣管控</td><td><span class="cx">—</span> 無</td><td class="td-dos"><span class="ck">✓</span> 授權框架 + 即時越界告警</td></tr>
        <tr><td>個人能效診斷</td><td><span class="cx">—</span> 無或僅有排名</td><td class="td-dos"><span class="ck">✓</span> 散佈圖診斷，下探每一個人</td></tr>
        <tr><td>導入方式</td><td>顧問常駐，數月起跳</td><td class="td-dos"><span class="ck">✓</span> 敏捷交付，核心模組優先上線</td></tr>
        <tr><td>設計哲學</td><td>你跟著系統走</td><td class="td-dos"><span class="ck">✓</span> 系統跟著你走</td></tr>
      </tbody>
    </table>
  </div>
</section>

<!-- TESTIMONIALS -->
<section id="testimonials">
  <div class="section-inner">
    <div class="test-hdr">
      <p class="section-tag">// REAL_VALIDATION</p>
      <h2 class="section-title"><em>真實場景</em>，真實驗證</h2>
      <p class="section-body" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%">DealerOS 已在台灣 Premium 重機代理商市場完成實際場景驗證，涵蓋三層與四層組織架構的集團客戶。</p>
    </div>
    <div class="test-grid">
      <div class="test-card"><p class="test-quote">我們之前用過其他系統，員工總是抱怨流程太死板。DealerOS 上線後，主管第一週就能看到各門店的即時數據，業務員說「這個用起來跟我平常想的一樣」——這句話讓我覺得一切都值了。</p><div class="test-src">某台灣 Premium 重機代理商集團（三層架構）· 集團管理層主管</div></div>
      <div class="test-card"><p class="test-quote">最讓我驚訝的是集團管控的功能——我可以設定各門店的折扣授權範圍，一旦有人超標系統立刻通知我。再也不用擔心門店私下破壞品牌定價，這對我們這種 Premium 品牌太重要了。</p><div class="test-src">某台灣歐系 Premium 重機代理商（四層架構）· 代理商負責人</div></div>
    </div>
  </div>
</section>

<!-- CTA -->

<!-- ── DMS EVOLUTION ─────────────────────── -->
<section id="dms-evolution" style="padding:7rem 0;background:#ffffff;border-top:1px solid rgba(0,0,0,0.06)">
  <div style="max-width:1160px;margin:0 auto;padding:0 5vw">

    <!-- 標題 -->
    <p style="font-family:'JetBrains Mono',monospace;font-size:.63rem;letter-spacing:.18em;
      color:#00aa55;margin-bottom:1rem;text-transform:uppercase">// DMS_EVOLUTION</p>
    <h2 style="font-family:'JetBrains Mono',monospace;font-size:clamp(1.5rem,2.6vw,2.3rem);
      font-weight:700;line-height:1.15;margin-bottom:.6rem;color:#0a1120">
      所以現在的業者，<span style="color:#00aa55">用的是哪一套？</span>
    </h2>
    <p style="font-family:'JetBrains Mono',monospace;font-size:.8rem;color:rgba(0,0,0,0.35);
      margin-bottom:3.5rem;font-style:italic">Data analysis as the starting point and basis</p>

    <!-- 時間軸容器 -->
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:0;
      border:1px solid rgba(0,0,0,0.1);border-radius:8px;overflow:hidden">

      <!-- DMS 1.x -->
      <div class="dms-col" style="opacity:0;transform:translateX(-20px);transition:opacity .5s ease,transform .5s ease;
        padding:1.8rem 1.4rem;border-right:1px solid rgba(0,0,0,0.08);background:#f9f9f9">
        <div style="font-family:'JetBrains Mono',monospace;font-size:.65rem;
          letter-spacing:.12em;color:rgba(0,0,0,0.3);margin-bottom:.6rem">1992 ~ 2005</div>
        <div style="font-family:'JetBrains Mono',monospace;font-size:1.1rem;
          font-weight:700;color:rgba(0,0,0,0.35);margin-bottom:.8rem">DMS 1.x</div>
        <div style="display:inline-block;font-family:'JetBrains Mono',monospace;
          font-size:.72rem;color:rgba(0,0,0,0.3);background:rgba(0,0,0,0.06);
          padding:.3rem .8rem;border-radius:3px;margin-bottom:1.2rem">單機 / LAN 架構</div>
        <p style="font-size:.8rem;color:rgba(0,0,0,0.4);line-height:1.75;margin:0">
          採用較原始的程式語言及資料庫，開發設計時間長、未來修改與擴充性較差，整體系統運行速度慢。
        </p>
      </div>

      <!-- DMS 2.x -->
      <div class="dms-col" style="opacity:0;transform:translateX(-20px);transition:opacity .5s ease .18s,transform .5s ease .18s;
        padding:1.8rem 1.4rem;border-right:1px solid rgba(0,0,0,0.08);background:#f5f5f5">
        <div style="font-family:'JetBrains Mono',monospace;font-size:.65rem;
          letter-spacing:.12em;color:rgba(0,0,0,0.35);margin-bottom:.6rem">2006 ~ 2015</div>
        <div style="font-family:'JetBrains Mono',monospace;font-size:1.1rem;
          font-weight:700;color:rgba(0,0,0,0.45);margin-bottom:.8rem">DMS 2.x</div>
        <div style="display:inline-block;font-family:'JetBrains Mono',monospace;
          font-size:.72rem;color:rgba(0,0,0,0.4);background:rgba(0,0,0,0.08);
          padding:.3rem .8rem;border-radius:3px;margin-bottom:1.2rem">分散式架構</div>
        <p style="font-size:.8rem;color:rgba(0,0,0,0.5);line-height:1.75;margin:0">
          採用較新的程式語言與資料庫，開始重視分層式架構，也導入以「客戶」為中心的設計概念。
        </p>
      </div>

      <!-- DMS 3.x -->
      <div class="dms-col" style="opacity:0;transform:translateX(-20px);transition:opacity .5s ease .36s,transform .5s ease .36s;
        padding:1.8rem 1.4rem;border-right:1px solid rgba(0,0,0,0.08);background:#f0f0f0">
        <div style="font-family:'JetBrains Mono',monospace;font-size:.65rem;
          letter-spacing:.12em;color:rgba(0,0,0,0.4);margin-bottom:.6rem">2016 ~ 2019</div>
        <div style="font-family:'JetBrains Mono',monospace;font-size:1.1rem;
          font-weight:700;color:rgba(0,0,0,0.6);margin-bottom:.8rem">DMS 3.x</div>
        <div style="display:inline-block;font-family:'JetBrains Mono',monospace;
          font-size:.72rem;color:rgba(0,0,0,0.5);background:rgba(0,0,0,0.09);
          padding:.3rem .8rem;border-radius:3px;margin-bottom:1.2rem">一貫化概念</div>
        <p style="font-size:.8rem;color:rgba(0,0,0,0.6);line-height:1.75;margin:0">
          從網際網路普及與個人終端可移動化的影響，逐漸考慮從社群化起、側重在客戶畫像與消費特性的取得。
        </p>
      </div>

      <!-- DMS 4.0 ← 高亮欄 -->
      <div class="dms-col" style="opacity:0;transform:translateX(-20px);transition:opacity .5s ease .54s,transform .5s ease .54s;
        padding:1.8rem 1.4rem;background:#0a1120;position:relative;overflow:hidden">
        <!-- 背景光暈 -->
        <div style="position:absolute;top:-30%;left:-20%;width:140%;height:160%;
          background:radial-gradient(ellipse,rgba(0,221,110,0.1) 0%,transparent 65%);
          pointer-events:none"></div>
        <div style="font-family:'JetBrains Mono',monospace;font-size:.65rem;
          letter-spacing:.12em;color:rgba(0,221,110,0.6);margin-bottom:.6rem;position:relative">2020+ NOW</div>
        <div style="font-family:'JetBrains Mono',monospace;font-size:1.1rem;
          font-weight:700;color:#00dd6e;margin-bottom:.8rem;position:relative">DMS 4.0</div>
        <div style="display:inline-block;font-family:'JetBrains Mono',monospace;
          font-size:.72rem;color:#0a1120;background:#00dd6e;font-weight:700;
          padding:.3rem .8rem;border-radius:3px;margin-bottom:1.2rem;position:relative">數智深化的時代</div>
        <p style="font-size:.8rem;color:rgba(255,255,255,0.6);line-height:1.75;
          margin:0 0 1.2rem;position:relative">
          B2B2C 四層貫通、個人能效即時可視、集團管控一體化——這是下一代代理商管理系統的樣子。
        </p>
        <!-- DealerOS badge -->
        <div style="position:relative;display:inline-flex;align-items:center;gap:.5rem;
          border:1px solid rgba(0,221,110,0.4);padding:.4rem .9rem;border-radius:3px;
          background:rgba(0,221,110,0.08)">
          <span style="width:6px;height:6px;border-radius:50%;background:#00dd6e;
            animation:blink 2s step-end infinite"></span>
          <span style="font-family:'JetBrains Mono',monospace;font-size:.72rem;
            color:#00dd6e;font-weight:700;letter-spacing:.06em">DealerOS</span>
        </div>
      </div>
    </div>

    <!-- 底部箭頭說明 -->
    <div style="display:flex;align-items:center;justify-content:center;
      gap:0;margin-top:1.5rem;overflow:hidden">
      <div style="font-family:'JetBrains Mono',monospace;font-size:.7rem;
        color:rgba(0,0,0,0.2)">過去</div>
      <div style="flex:1;height:1px;background:linear-gradient(90deg,
        rgba(0,0,0,0.08),rgba(0,221,110,0.6));margin:0 1rem"></div>
      <div style="font-family:'JetBrains Mono',monospace;font-size:.7rem;
        color:#00aa55;font-weight:700">現在 · DealerOS</div>
    </div>

    <!-- 反思引導文字 -->
    <p style="text-align:center;margin-top:2rem;font-family:'JetBrains Mono',monospace;
      font-size:.88rem;color:rgba(0,0,0,0.45);letter-spacing:.04em">
      你現在用的，是哪一代？
      <span style="color:#00aa55;font-weight:700;margin-left:.5rem">→ 是時候升級了。</span>
    </p>

  </div>
</section>

<!-- scroll 觸發動畫 -->



<section id="cta">
  <div class="section-inner">
    <p class="cta-tag">// GET_STARTED</p>
    <h2 class="cta-title">你的集團，值得一套<br><em>真正懂你的系統</em></h2>
    <p class="cta-sub">不是功能展示，是一場針對你的問題量身設計的對話。</p>
    <p class="cta-note">// 我們的團隊精小而專注，只接受真正準備好的合作夥伴。</p>
    <div class="cta-btns">
      <a href="mailto:contact@di-consulting.com" class="btn-g">[ 預約一對一說明 ]</a>
      <a href="#dimensions" class="btn-ghost">先了解七維矩陣 →</a>
    </div>
  </div>
</section>

<footer>
  <span>DEALER<strong>OS</strong> · © 2026 DI Consulting · All rights reserved.</span>
  <span><a href="/login">[ 系統登入 ]</a> · <a href="mailto:contact@di-consulting.com">聯絡我們</a></span>
</footer>
`;

export default function LandingPage() {
  useEffect(() => {
    const timers: Array<ReturnType<typeof setTimeout>> = [];
    const intervals: Array<ReturnType<typeof setInterval>> = [];
    const observers: IntersectionObserver[] = [];
    const cleanups: Array<() => void> = [];
    let cancelled = false;

    // ── 1. HERO 三支影片輪播（自動 6s 切 + 播完切下一支 + 點點手動切）──
    (function () {
      const videos = [0, 1, 2]
        .map((i) => document.getElementById("v" + i) as HTMLVideoElement | null)
        .filter((v): v is HTMLVideoElement => !!v);
      const dots = Array.from(document.querySelectorAll<HTMLElement>(".vdot"));
      if (videos.length < 3) return;
      let current = 0;
      let autoTimer: ReturnType<typeof setInterval>;
      const show = (idx: number) => {
        videos[current]?.classList.remove("active");
        dots[current]?.classList.remove("active");
        current = idx;
        videos[current]?.classList.add("active");
        dots[current]?.classList.add("active");
        try {
          videos[current].currentTime = 0;
          void videos[current].play();
        } catch {}
        resetAuto();
      };
      const next = () => show((current + 1) % videos.length);
      const resetAuto = () => {
        clearInterval(autoTimer);
        autoTimer = setInterval(next, 6000);
        intervals.push(autoTimer);
      };
      videos.forEach((v, i) => {
        const onEnded = () => show((i + 1) % videos.length);
        v.addEventListener("ended", onEnded);
        cleanups.push(() => v.removeEventListener("ended", onEnded));
      });
      dots.forEach((d, i) => {
        const onClick = () => show(i);
        d.addEventListener("click", onClick);
        cleanups.push(() => d.removeEventListener("click", onClick));
      });
      resetAuto();
      try {
        void videos[0].play();
      } catch {}
    })();

    // ── 2. DMS 時間軸欄位滑入 ──
    (function () {
      const obs = new IntersectionObserver(
        (entries) => {
          entries.forEach((e) => {
            if (e.isIntersecting) {
              const el = e.target as HTMLElement;
              el.style.opacity = "1";
              el.style.transform = "translateX(0)";
              obs.unobserve(e.target);
            }
          });
        },
        { threshold: 0.2 }
      );
      document.querySelectorAll(".dms-col").forEach((c) => obs.observe(c));
      observers.push(obs);
    })();

    // ── 3. 打字機 ──
    (function () {
      const el = document.getElementById("tw");
      if (!el) return;
      const lines = [
        "SYSTEM FOLLOWS YOU — ANYWHERE, ANYTIME",
        "B2B2C · OEM → 代理商 → 門店 → 個人",
        "資深顧問實戰經驗提煉 · 敏捷交付落地",
      ];
      let li = 0, ci = 0, del = false, wait = 0;
      const cur = el.querySelector(".cur");
      function type() {
        if (cancelled || !el) return;
        const txt = lines[li];
        if (!del) {
          el.textContent = txt.slice(0, ci + 1);
          if (cur) el.appendChild(cur);
          ci++;
          if (ci === txt.length) { del = true; wait = 55; }
        } else {
          if (wait-- > 0) { timers.push(setTimeout(type, 40)); return; }
          el.textContent = txt.slice(0, ci - 1);
          if (cur) el.appendChild(cur);
          ci--;
          if (ci === 0) { del = false; li = (li + 1) % lines.length; wait = 18; }
        }
        timers.push(setTimeout(type, del ? 26 : 58));
      }
      timers.push(setTimeout(type, 900));
    })();

    // ── 4. 痛點卡片 scroll 淡入 ──
    (function () {
      const obs = new IntersectionObserver(
        (entries) => {
          entries.forEach((e, i) => {
            if (e.isIntersecting) {
              timers.push(setTimeout(() => e.target.classList.add("vis"), i * 90));
              obs.unobserve(e.target);
            }
          });
        },
        { threshold: 0.1 }
      );
      document.querySelectorAll(".pain-card").forEach((c) => obs.observe(c));
      observers.push(obs);
    })();

    // ── 5. 數字計數器 ──
    (function () {
      const targets = [
        { id: "s1", val: 20 },
        { id: "s2", val: 4 },
        { id: "s3", val: 22 },
        { id: "s4", val: 7 },
      ];
      const obs = new IntersectionObserver(
        (entries) => {
          entries.forEach((e) => {
            if (!e.isIntersecting) return;
            const cfg = targets.find((t) => t.id === e.target.id);
            if (!cfg) return;
            let n = 0;
            const step = () => {
              if (cancelled) return;
              n += Math.ceil(cfg.val / 22);
              if (n >= cfg.val) { e.target.textContent = String(cfg.val); return; }
              e.target.textContent = String(n);
              requestAnimationFrame(step);
            };
            step();
            obs.unobserve(e.target);
          });
        },
        { threshold: 0.5 }
      );
      targets.forEach((t) => {
        const el = document.getElementById(t.id);
        if (el) obs.observe(el);
      });
      observers.push(obs);
    })();

    return () => {
      cancelled = true;
      timers.forEach((t) => clearTimeout(t));
      intervals.forEach((i) => clearInterval(i));
      observers.forEach((o) => o.disconnect());
      cleanups.forEach((fn) => fn());
    };
  }, []);

  return <div className="ld-v3" dangerouslySetInnerHTML={{ __html: LANDING_HTML }} />;
}

"use client";

import { useEffect } from "react";
import "./landing-v3.css";

// 整頁 markup 原樣搬自 docs/20260530/DealerOS_Landing_v2.html。
// 唯一連動：footer「系統登入」連到 /login（原檔已是 href="/login"）。
const LANDING_HTML = `
  <!-- ── NAV ─────────────────────────────── -->
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

  <!-- ── HERO ────────────────────────────── -->
  <section id="hero">
    <div class="hero-left">
      <div class="hero-system-id">B2B2C · PREMIUM DEALER GROUP MANAGEMENT OS · v3.0</div>

      <h1 class="hero-title">
        <span class="line1">讓系統</span><br>
        <span class="line2">跟著你走</span>
      </h1>

      <div class="hero-typewriter" id="typewriter"><span class="cursor"></span></div>

      <p class="hero-desc">
        專為 <strong>Premium 代理商集團</strong>打造的 B2B2C 管理作業系統。<br>
        由資深顧問實戰經驗提煉，以<strong>敏捷交付</strong>模式落地——<br>
        從授權框架到個人能效，四層組織一套系統貫通。
      </p>

      <div class="hero-btns">
        <a href="#cta" class="btn-green">[ 預約一對一說明 ]</a>
        <a href="#dimensions" class="btn-ghost">了解七維矩陣 →</a>
      </div>
    </div>

    <div class="hero-right">
      <div class="terminal-window">
        <div class="terminal-bar">
          <div class="t-dot red"></div>
          <div class="t-dot yellow"></div>
          <div class="t-dot green"></div>
          <span class="terminal-title">dealeros://group-mgmt — 集團即時總覽</span>
        </div>
        <div class="terminal-body">
          <!-- 終端機輸出 -->
          <div class="t-line"><span class="t-prompt">▸ </span><span class="t-cmd">dos group --view=realtime
              --org=all-stores</span></div>
          <div class="t-line"><span class="t-comment">◯ 連線集團資料庫… 已同步 5 間門店</span></div>
          <div class="t-line">&nbsp;</div>
          <div class="t-line"><span class="t-comment">// 門店銷售達成率</span></div>

          <!-- 橫條圖 -->
          <div style="margin:8px 0 12px">
            <div class="bar-row"><span class="bar-name">台北旗艦</span>
              <div class="bar-bg">
                <div class="bar-fill g" style="width:0" data-w="94"></div>
              </div><span class="bar-pct g">94%</span>
            </div>
            <div class="bar-row"><span class="bar-name">台中直營</span>
              <div class="bar-bg">
                <div class="bar-fill y" style="width:0" data-w="72"></div>
              </div><span class="bar-pct y">72%</span>
            </div>
            <div class="bar-row"><span class="bar-name">高雄直營</span>
              <div class="bar-bg">
                <div class="bar-fill y" style="width:0" data-w="68"></div>
              </div><span class="bar-pct y">68%</span>
            </div>
            <div class="bar-row"><span class="bar-name">台南授權</span>
              <div class="bar-bg">
                <div class="bar-fill g" style="width:0" data-w="89"></div>
              </div><span class="bar-pct g">89%</span>
            </div>
            <div class="bar-row"><span class="bar-name">嘉義授權</span>
              <div class="bar-bg">
                <div class="bar-fill r" style="width:0" data-w="51"></div>
              </div><span class="bar-pct r">51%</span>
            </div>
          </div>

          <!-- KPI 卡片 -->
          <div class="kpi-cards">
            <div class="kpi-card">
              <div class="kpi-label">集團達成率</div>
              <div class="kpi-val" id="kpi-achieve">84.7%</div>
              <div class="kpi-delta">▲ +3.2% vs 上月</div>
            </div>
            <div class="kpi-card">
              <div class="kpi-label">Health Score</div>
              <div class="kpi-val">87 <span style="font-size:.7rem;color:var(--dimmer)">/100</span></div>
              <div class="kpi-delta">集團最高門店</div>
            </div>
            <div class="kpi-card">
              <div class="kpi-label">客戶 NPS</div>
              <div class="kpi-val">+62</div>
              <div class="kpi-delta">▲ 本季新高</div>
            </div>
            <div class="kpi-card">
              <div class="kpi-label">折扣越界告警</div>
              <div class="kpi-val warn">2 筆</div>
              <div class="kpi-delta">⚠ 需即時處理</div>
            </div>
          </div>

          <div style="margin-top:12px">
            <div class="t-line"><span class="t-warn">⚠ </span><span class="t-data">嘉義授權商達成率 51% — 低於集團均值 33pts</span>
            </div>
            <div class="t-line"><span class="t-prompt">▸ </span><span class="t-comment" id="blink-cursor">_</span></div>
          </div>
        </div>
      </div>
    </div>
  </section>

  <!-- 跑馬燈 -->
  <div class="ticker-wrap">
    <div class="ticker" id="ticker">
      <span class="ticker-item"><span class="dot">◆</span> B2B2C 四層架構原生支援</span>
      <span class="ticker-item"><span class="dot">◆</span> 系統跟著你走 — MOBILE FIRST</span>
      <span class="ticker-item"><span class="dot">◆</span> 22 項 KPI 即時對標</span>
      <span class="ticker-item"><span class="dot">◆</span> 個人能效散佈圖診斷</span>
      <span class="ticker-item"><span class="dot">◆</span> 敏捷交付 · 核心模組優先上線</span>
      <span class="ticker-item"><span class="dot">◆</span> 折扣授權框架 + 即時越界告警</span>
      <span class="ticker-item"><span class="dot">◆</span> 資深顧問實戰經驗提煉</span>
      <span class="ticker-item"><span class="dot">◆</span> v3.0 ready for deployment</span>
      <!-- 複製一份跑馬燈 -->
      <span class="ticker-item"><span class="dot">◆</span> B2B2C 四層架構原生支援</span>
      <span class="ticker-item"><span class="dot">◆</span> 系統跟著你走 — MOBILE FIRST</span>
      <span class="ticker-item"><span class="dot">◆</span> 22 項 KPI 即時對標</span>
      <span class="ticker-item"><span class="dot">◆</span> 個人能效散佈圖診斷</span>
      <span class="ticker-item"><span class="dot">◆</span> 敏捷交付 · 核心模組優先上線</span>
      <span class="ticker-item"><span class="dot">◆</span> 折扣授權框架 + 即時越界告警</span>
      <span class="ticker-item"><span class="dot">◆</span> 資深顧問實戰經驗提煉</span>
      <span class="ticker-item"><span class="dot">◆</span> v3.0 ready for deployment</span>
    </div>
  </div>

  <!-- ── PAIN POINTS ──────────────────────── -->
  <section id="pain">
    <div class="section-inner">
      <div class="pain-header">
        <p class="section-tag">// PAIN_POINTS</p>
        <h2 class="section-title">這些場景，<em>你是否似曾相識？</em></h2>
        <p class="section-body" style="margin:0 auto">這不是管理不夠努力，是工具不夠懂你。</p>
      </div>
      <div class="pain-grid">
        <div class="pain-card">
          <div class="pain-num">01 /</div><span class="pain-x">✕</span>
          <p class="pain-text">集團總部想掌握各門店即時狀況，卻只能等月底報表開會，黃金介入時機早已錯失。</p>
        </div>
        <div class="pain-card">
          <div class="pain-num">02 /</div><span class="pain-x">✕</span>
          <p class="pain-text">某門店折扣超標損害品牌形象，發現時已為時已晚，代理商徒呼負負。</p>
        </div>
        <div class="pain-card">
          <div class="pain-num">03 /</div><span class="pain-x">✕</span>
          <p class="pain-text">頂尖業務或服務顧問離職，客戶關係與作戰方法跟著消失，找不回來。</p>
        </div>
        <div class="pain-card">
          <div class="pain-num">04 /</div><span class="pain-x">✕</span>
          <p class="pain-text">花大錢導入系統，員工卻說「太難用，我還是用 Excel」，導入等於白做。</p>
        </div>
        <div class="pain-card">
          <div class="pain-num">05 /</div><span class="pain-x">✕</span>
          <p class="pain-text">無法同時掌控直營店與授權經銷商的執行落差，管太緊傷感情，放太鬆出問題。</p>
        </div>
        <div class="pain-card">
          <div class="pain-num">06 /</div><span class="pain-x">✕</span>
          <p class="pain-text">個人能效靠感覺判斷，全店平均數字掩蓋真相——不知道誰在撐、誰在拖。</p>
        </div>
      </div>
      <p class="pain-closer">// 工具不對，<em>努力也會白費。</em></p>
    </div>
  </section>

  <!-- ── MANIFESTO ────────────────────────── -->
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
            結果是：你上手的速度比想像快，<br>
            但系統能支撐你成長的深度，遠比想像的深。
          </p>
        </div>
        <div class="stats-grid">
          <div class="stat-card">
            <div class="stat-num"><span id="s1">0</span><sup>+</sup></div>
            <div class="stat-lbl">管理功能模組<br>涵蓋集團到個人完整鏈路</div>
          </div>
          <div class="stat-card">
            <div class="stat-num"><span id="s2">0</span></div>
            <div class="stat-lbl">層組織架構貫通<br>OEM → 代理商 → 門店 → 個人</div>
          </div>
          <div class="stat-card">
            <div class="stat-num"><span id="s3">0</span></div>
            <div class="stat-lbl">項 KPI 即時對標<br>參考國際頂尖管理框架</div>
          </div>
          <div class="stat-card">
            <div class="stat-num"><span id="s4">0</span></div>
            <div class="stat-lbl">個管理維度<br>從角色權限到風險預警</div>
          </div>
        </div>
      </div>
    </div>
  </section>

  <!-- ── 7 DIMENSIONS ─────────────────────── -->
  <section id="dimensions">
    <div class="section-inner">
      <div class="dim-header">
        <p class="section-tag">// SEVEN_DIMENSIONS</p>
        <h2 class="section-title">七個維度，<em>貫通每一層決策</em></h2>
        <p class="section-body">不是功能清單，是一套完整的管理方法論。每個維度對應一個真實的管理痛點。</p>
      </div>
      <div class="dim-list">
        <div class="dim-item">
          <div class="dim-n">01 /</div>
          <div>
            <div class="dim-name">角色與權限</div>
            <div class="dim-desc">代理商看全部，門店只看自己——安全邊界由系統守住，不靠人工管控。資料存取依組織層級自動篩選，杜絕越權與資料洩漏。</div>
          </div>
        </div>
        <div class="dim-item">
          <div class="dim-n">02 /</div>
          <div>
            <div class="dim-name">即時洞察</div>
            <div class="dim-desc">讓盲點無所遁形。每一個異常在它釀成問題之前就被看見——快速指標每 15 分鐘更新，主管介入從月底縮短到當天。</div>
          </div>
        </div>
        <div class="dim-item">
          <div class="dim-n">03 /</div>
          <div>
            <div class="dim-name">流程自動化</div>
            <div class="dim-desc">告別卡頓，工作流自動導航。從接待到交車，每一步都有系統銜接，不靠人工傳遞，不因人員異動而斷鏈。</div>
          </div>
        </div>
        <div class="dim-item">
          <div class="dim-n">04 /</div>
          <div>
            <div class="dim-name">客戶價值管理</div>
            <div class="dim-desc">精準服務送到心坎裡。每位客戶的偏好、歷程與價值完整留在系統裡——人走資料不走，頂尖業務的方法論成為組織資產。</div>
          </div>
        </div>
        <div class="dim-item">
          <div class="dim-n">05 /</div>
          <div>
            <div class="dim-name">集團戰略同步</div>
            <div class="dim-desc">全店同步，戰略一體。代理商的每一個決策即時落地到每一家門店——折扣政策、促銷活動、KPI 目標，一個動作全面生效。</div>
          </div>
        </div>
        <div class="dim-item">
          <div class="dim-n">06 /</div>
          <div>
            <div class="dim-name">風險預警</div>
            <div class="dim-desc">問題發生前先按防護盾。折扣越界、客戶流失風險、庫存告警——系統主動推送，代理商永遠比問題先一步。</div>
          </div>
        </div>
        <div class="dim-item">
          <div class="dim-n">07 /</div>
          <div>
            <div class="dim-name">彈性擴容</div>
            <div class="dim-desc">尖峰時服務不降級。敏捷架構支援業務成長，三層或四層組織隨需切換，系統跟著你的規模長大，不需重新導入。</div>
          </div>
        </div>
      </div>
    </div>
  </section>

  <!-- ── GROUP LAYER ──────────────────────── -->
  <section id="group">
    <div class="section-inner">
      <div class="group-header">
        <p class="section-tag">// GROUP_MANAGEMENT</p>
        <h2 class="section-title">業界唯一：<em>四層全貫通</em></h2>
        <p class="section-body">傳統管理系統的設計終點是「門店」。DealerOS 從代理商集團的視角出發，讓每一層都有對應的管理工具。</p>
      </div>

      <div class="layers">
        <div class="layer">
          <div class="layer-card l1">
            <div class="layer-name">代理商總部</div>
            <div class="layer-desc">制定折扣授權框架、KPI 標竿、集團戰略目標，即時掌握全網絡狀態</div>
          </div>
        </div>
        <span class="layer-arrow">↓</span>
        <div class="layer">
          <div class="layer-card l2">
            <div class="layer-name">直營店 / 授權經銷商</div>
            <div class="layer-desc">在授權範圍內執行業務，超出即時告警，績效自動彙報至集團</div>
          </div>
        </div>
        <span class="layer-arrow">↓</span>
        <div class="layer">
          <div class="layer-card l3">
            <div class="layer-name">門店各部門</div>
            <div class="layer-desc">銷售、售後、庫存日常作業全流程數位化，部門數據即時串通</div>
          </div>
        </div>
        <span class="layer-arrow">↓</span>
        <div class="layer">
          <div class="layer-card l4">
            <div class="layer-name">個人（業務員 / 服務顧問 / 技師）</div>
            <div class="layer-desc">個人能效即時可視，平均值不再掩蓋真相，輔導與激勵有所依據</div>
          </div>
        </div>
      </div>

      <div class="hl-grid">
        <div class="hl-card">
          <div class="hl-icon">📊</div>
          <div class="hl-title">集團即時儀表板</div>
          <div class="hl-body">每天早上一頁，掌握全部門店的銷售達成、售後品質與健康狀態。不等月底，不開會，異常門店主動推送。</div>
        </div>
        <div class="hl-card">
          <div class="hl-icon">🔬</div>
          <div class="hl-title">個人能效散佈圖</div>
          <div class="hl-body">平均值說謊，散佈圖才說真話。業界首創下探到每一個人的診斷視角——誰在撐、誰需要輔導，一眼看穿。</div>
        </div>
        <div class="hl-card">
          <div class="hl-icon">🔐</div>
          <div class="hl-title">折扣授權管控</div>
          <div class="hl-body">代理商設定授權框架，門店在範圍內執行，越界即時標示。品牌定價紀律不靠人工盯，系統自動守住。</div>
        </div>
      </div>
    </div>
  </section>

  <!-- ── COMPARE ───────────────────────────── -->
  <section id="compare">
    <div class="section-inner">
      <div class="compare-hdr">
        <p class="section-tag">// COMPARISON</p>
        <h2 class="section-title">傳統 DMS，管好一家店。<br><em>DealerOS，管好整個網絡。</em></h2>
      </div>
      <table class="compare-table">
        <thead>
          <tr>
            <th></th>
            <th class="th-comp">傳統 DMS</th>
            <th class="th-dos">DealerOS v3.0</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>設計對象</td>
            <td>單一門店作業人員</td>
            <td class="td-dos"><span class="ck">✓</span> 代理商集團管理層 + 門店</td>
          </tr>
          <tr>
            <td>組織視野</td>
            <td>門店內部</td>
            <td class="td-dos"><span class="ck">✓</span> 集團→門店→個人，四層貫通</td>
          </tr>
          <tr>
            <td>KPI 管理</td>
            <td>附加報表功能</td>
            <td class="td-dos"><span class="ck">✓</span> 22 項指標即時對標，核心設計</td>
          </tr>
          <tr>
            <td>折扣管控</td>
            <td><span class="cx">—</span> 無</td>
            <td class="td-dos"><span class="ck">✓</span> 授權框架 + 即時越界告警</td>
          </tr>
          <tr>
            <td>個人能效診斷</td>
            <td><span class="cx">—</span> 無或僅有排名</td>
            <td class="td-dos"><span class="ck">✓</span> 散佈圖診斷，下探每一個人</td>
          </tr>
          <tr>
            <td>導入方式</td>
            <td>顧問常駐，數月起跳</td>
            <td class="td-dos"><span class="ck">✓</span> 敏捷交付，核心模組優先上線</td>
          </tr>
          <tr>
            <td>設計哲學</td>
            <td>你跟著系統走</td>
            <td class="td-dos"><span class="ck">✓</span> 系統跟著你走</td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>

  <!-- ── TESTIMONIALS ─────────────────────── -->
  <section id="testimonials">
    <div class="section-inner">
      <div class="test-hdr">
        <p class="section-tag">// REAL_VALIDATION</p>
        <h2 class="section-title"><em>真實場景</em>，真實驗證</h2>
        <p class="section-body">DealerOS 已在台灣 Premium 重機代理商市場完成實際場景驗證，涵蓋三層與四層組織架構的集團客戶。</p>
      </div>
      <div class="test-grid">
        <div class="test-card">
          <p class="test-quote">我們之前用過其他系統，員工總是抱怨流程太死板。DealerOS 上線後，主管第一週就能看到各門店的即時數據，業務員說「這個用起來跟我平常想的一樣」——這句話讓我覺得一切都值了。
          </p>
          <div class="test-src">某台灣 Premium 重機代理商集團（三層架構）· 集團管理層主管</div>
        </div>
        <div class="test-card">
          <p class="test-quote">最讓我驚訝的是集團管控的功能——我可以設定各門店的折扣授權範圍，一旦有人超標系統立刻通知我。再也不用擔心門店私下破壞品牌定價，這對我們這種 Premium 品牌來說太重要了。
          </p>
          <div class="test-src">某台灣歐系 Premium 重機代理商（四層架構）· 代理商負責人</div>
        </div>
      </div>
    </div>
  </section>

  <!-- ── CTA ───────────────────────────────── -->
  <section id="cta">
    <div class="section-inner">
      <p class="cta-tag">// GET_STARTED</p>
      <h2 class="cta-title">你的集團，值得一套<br><em>真正懂你的系統</em></h2>
      <p class="cta-sub">不是功能展示，是一場針對你的問題量身設計的對話。</p>
      <p class="cta-note">// 我們的團隊精小而專注，只接受真正準備好的合作夥伴。</p>
      <div class="cta-btns">
        <a href="mailto:contact@di-consulting.com" class="btn-green">[ 預約一對一說明 ]</a>
        <a href="#dimensions" class="btn-ghost">先了解七維矩陣 →</a>
      </div>
    </div>
  </section>

  <!-- ── FOOTER ────────────────────────────── -->
  <footer>
    <span>DEALER<strong>OS</strong> · © 2026 DI Consulting · All rights reserved.</span>
    <span>
      <a href="/login">[ 系統登入 ]</a>
      &nbsp;·&nbsp;
      <a href="mailto:contact@di-consulting.com">聯絡我們</a>
    </span>
  </footer>
`;

export default function LandingPage() {
  useEffect(() => {
    const timers: Array<ReturnType<typeof setTimeout>> = [];
    const intervals: Array<ReturnType<typeof setInterval>> = [];
    const observers: IntersectionObserver[] = [];
    let cancelled = false;

    // ── 1. 打字機效果 ──────────────────────────
    (function () {
      const el = document.getElementById("typewriter");
      if (!el) return;
      const lines = [
        "SYSTEM FOLLOWS YOU — ANYWHERE, ANYTIME",
        "B2B2C · OEM → 代理商 → 門店 → 個人",
        "資深顧問實戰經驗提煉 · 敏捷交付落地",
      ];
      let li = 0,
        ci = 0,
        deleting = false,
        wait = 0;
      const cursor = el.querySelector(".cursor");

      function type() {
        if (cancelled || !el) return;
        const txt = lines[li];
        if (!deleting) {
          el.textContent = txt.slice(0, ci + 1);
          if (cursor) el.appendChild(cursor);
          ci++;
          if (ci === txt.length) {
            deleting = true;
            wait = 60;
          }
        } else {
          if (wait-- > 0) {
            timers.push(setTimeout(type, 40));
            return;
          }
          el.textContent = txt.slice(0, ci - 1);
          if (cursor) el.appendChild(cursor);
          ci--;
          if (ci === 0) {
            deleting = false;
            li = (li + 1) % lines.length;
            wait = 20;
          }
        }
        timers.push(setTimeout(type, deleting ? 28 : 60));
      }
      timers.push(setTimeout(type, 800));
    })();

    // ── 2. 終端機游標閃爍 ──────────────────────
    (function () {
      const el = document.getElementById("blink-cursor");
      if (!el) return;
      intervals.push(
        setInterval(() => {
          el.style.opacity = el.style.opacity === "0" ? "1" : "0";
        }, 600)
      );
    })();

    // ── 3. 橫條動畫 ────────────────────────────
    (function () {
      const bars = document.querySelectorAll<HTMLElement>(".bar-fill");
      const obs = new IntersectionObserver(
        (entries) => {
          entries.forEach((e) => {
            if (e.isIntersecting) {
              const w = (e.target as HTMLElement).dataset.w;
              timers.push(
                setTimeout(() => {
                  (e.target as HTMLElement).style.width = w + "%";
                }, 200)
              );
              obs.unobserve(e.target);
            }
          });
        },
        { threshold: 0.3 }
      );
      bars.forEach((b) => obs.observe(b));
      observers.push(obs);
    })();

    // ── 4. KPI 數值微幅跳動 ────────────────────
    (function () {
      const el = document.getElementById("kpi-achieve");
      if (!el) return;
      intervals.push(
        setInterval(() => {
          const v = (84.7 + (Math.random() - 0.5) * 0.6).toFixed(1);
          el.textContent = v + "%";
        }, 3000)
      );
    })();

    // ── 5. 痛點卡片 scroll 淡入 ────────────────
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

    // ── 6. 數字計數器動畫 ──────────────────────
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
              n += Math.ceil(cfg.val / 25);
              if (n >= cfg.val) {
                e.target.textContent = String(cfg.val);
                return;
              }
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
    };
  }, []);

  return <div className="ld-v3" dangerouslySetInnerHTML={{ __html: LANDING_HTML }} />;
}

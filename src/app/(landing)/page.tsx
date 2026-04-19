"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import "./landing.css";

const HERO_VARIANTS = [
  <>
    把頂尖業務的<br/>
    <span className="accent">方法論</span> 寫進<span className="outline">流程</span>裡
  </>,
  <>
    像頂尖業務一樣<br/>
    <span className="outline">思考</span> <span className="slash">/</span> <span className="accent">成交</span> <span className="slash">/</span> <span className="outline">交付</span>
  </>,
  <>
    展場裡每一個 <span className="accent">成交瞬間</span><br/>都有跡可循。
  </>,
];

const PROCESS_STEPS = [
  {
    num: "01", title: "展場接觸 · 商機進線",
    body: "來客資訊 30 秒登錄，自動媒合廣告來源與歷史紀錄。如果是老客回訪，畫像與歷程立刻浮上來，讓業務在握手前就已經做好準備。",
    tech: ["QR 來客登錄", "廣告歸因", "老客識別"],
  },
  {
    num: "02", title: "面談畫像 · 結構化需求",
    body: "業務按結構化問題清單逐項記錄 — 家庭成員、預算區間、決策時程、競品比較 — 一次面談下來就有完整畫像。方法論寫進欄位裡，頂尖業務怎麼問、怎麼聽，新人照做就能成案。",
    tech: ["語音轉寫", "欄位抽取", "競品標記"],
  },
  {
    num: "03", title: "案件推進 · 階段追蹤",
    body: "看板式管道看穿團隊狀態。停滯 3 天？系統主動提醒。競品降價？熱度自動降級。你永遠不會因為忘了跟一個客戶而流單。",
    tech: ["Kanban", "停滯預警", "競品雷達"],
  },
  {
    num: "04", title: "成交結帳 · POS 收單",
    body: "合約、金流、分期、發票、交付單 — 一條龍簽完。每一筆交易同時寫回商機、業務獎金、產品銷售分析，收班不用再對帳到半夜。",
    tech: ["多金流", "電子合約", "自動對帳"],
  },
  {
    num: "05", title: "派工交付 · 技師到場",
    body: "交車、安裝、到府 — 派工面板自動挑最適合的技師，路徑最佳化，客戶收到即時追蹤連結。SLA 違約？系統在客戶抱怨前先警告你。",
    tech: ["自動派工", "路徑優化", "客戶追蹤頁"],
  },
  {
    num: "06", title: "維運續單 · 終身價值",
    body: "保固、保養、耗材、回購提醒 — 每一次接觸都是複購機會。老客轉介？自動歸因給推薦人，獎金不用人工算。",
    tech: ["保養排程", "NPS 追蹤", "轉介歸因"],
  },
];

export default function LandingPage() {
  const [openStep, setOpenStep] = useState(0);
  const [activeTab, setActiveTab] = useState(0);
  const [heroIndex, setHeroIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setHeroIndex((prev) => (prev + 1) % HERO_VARIANTS.length);
    }, 5500);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="ld-root">
      <div className="grid-bg" />
      <div className="noise" />

      {/* NAV */}
      <nav className="ld-nav">
        <div className="ld-logo">
          <span className="ld-logo-dot" />
          <span>DEALER<b>OS</b></span>
          <span className="ver">/ v2.4.1</span>
        </div>
        <div className="nav-mid">
          <a href="#features">功能</a>
          <a href="#dispatch">派工</a>
          <a href="#pos">POS 分析</a>
          <a href="#process">流程</a>
          <a href="#why">為什麼</a>
        </div>
        <div className="nav-right">
          <div className="status-chip"><span className="d" /><span>ALL SYSTEMS OPERATIONAL</span></div>
          <Link href="/login" className="btn-login">Log in</Link>
        </div>
      </nav>

      <main>
        {/* HERO */}
        <section className="hero">
          <div className="tag-pill">
            <span className="v">▲ v2.4.1</span>
            <span className="sep" />
            <span>面對面交易作業系統</span>
            <span className="sep" />
            <span className="live">◉ LIVE</span>
          </div>

          <h1 key={heroIndex} className="hero-title hero-title-anim">
            {HERO_VARIANTS[heroIndex]}
          </h1>

          <p className="hero-sub">
            DealerOS 是一套專為 <b>展場型 B2C</b>（車、房、船、精品）打造的作業系統。我們把頂尖業務的方法論寫進流程裡 — 從商機、畫像、歷程到派工與 POS 分析，<b>全流程在一張螢幕裡閉環</b>。
          </p>

          <div className="cta-row">
            <a className="btn btn-primary" href="#features">⌘ 探索功能</a>
            <Link className="btn btn-ghost" href="/login">進入系統 →</Link>
          </div>

          {/* TERMINAL */}
          <div className="terminal">
            <div className="tbar">
              <div className="dots"><span /><span /><span /></div>
              <div className="tbar-title">dealeros://operator@showroom-tpe-01 — dashboard</div>
              <div className="tabs">
                {["pipeline", "dispatch", "pos"].map((t, i) => (
                  <span key={t} className={activeTab === i ? "on" : ""} onClick={() => setActiveTab(i)}>{t}</span>
                ))}
              </div>
            </div>
            <div className="tbody">
              <aside className="tside">
                <div className="tside-h">OPERATIONS</div>
                <div className="tside-i on"><span>▸ 商機管理<span className="en">Lead</span></span><span className="kbd">⌘1</span></div>
                <div className="tside-i"><span>&nbsp;&nbsp;&nbsp;案件追蹤<span className="en">Deal</span></span><span className="kbd">⌘2</span></div>
                <div className="tside-i"><span>&nbsp;&nbsp;&nbsp;客戶畫像<span className="en">Persona</span></span><span className="kbd">⌘3</span></div>
                <div className="tside-i"><span>&nbsp;&nbsp;&nbsp;客戶歷程<span className="en">Journey</span></span><span className="kbd">⌘4</span></div>
                <div className="tside-h">AFTER-SALE</div>
                <div className="tside-i"><span>&nbsp;&nbsp;&nbsp;維運管理<span className="en">Service</span></span><span className="kbd">⌘5</span></div>
                <div className="tside-i"><span>&nbsp;&nbsp;&nbsp;派工系統<span className="en">Dispatch</span></span><span className="kbd">⌘6</span></div>
                <div className="tside-h">ANALYTICS</div>
                <div className="tside-i"><span>&nbsp;&nbsp;&nbsp;POS 脈動<span className="en">Pulse</span></span><span className="kbd">⌘7</span></div>
              </aside>

              <div className="tmain">
                <div className="prompt"><span className="u">operator</span><span style={{color:"var(--fg-3)"}}>@</span><span className="u">showroom-tpe-01</span><span style={{color:"var(--fg-3)"}}>:~$</span> <span className="c">dos pipeline --today --sort=stalled</span></div>
                <div className="line"><span style={{color:"var(--fg-3)"}}>◯</span> 讀取 <span className="b">147</span> 筆進行中商機…</div>
                <div className="line"><span className="s">✓</span> 依階段停滯天數 × 最後接觸時間排序</div>
                <div className="line" style={{marginTop:10}}><span className="k">▸ 今日待辦 · TOP 3</span></div>

                <div className="card">
                  <div className="card-h"><span>#4821 · 陳先生 · 旗艦 SUV</span><span className="hot">● 階段 : 試乘完成</span></div>
                  <div className="card-r"><span>上次接觸</span><b>2 天前</b></div>
                  <div className="card-r"><span>畫像備註</span><b>價格敏感度低 · 決策者本人</b></div>
                  <div className="card-r"><span>下一步（業務自訂）</span><b className="sug">電聯 · 附金流方案</b></div>
                </div>

                <div className="card">
                  <div className="card-h"><span>#4807 · 林小姐 · 都會房型</span><span className="warm">● 階段 : 二次看屋待約</span></div>
                  <div className="card-r"><span>上次接觸</span><b>5 天前 · 停滯警示</b></div>
                  <div className="card-r"><span>卡點（手動標記）</span><b>伴侶意見未對齊</b></div>
                  <div className="card-r"><span>下一步（業務自訂）</span><b className="sug">週末邀約夫妻二次看屋</b></div>
                </div>

                <div className="prompt" style={{marginTop:14}}><span className="u">operator</span><span style={{color:"var(--fg-3)"}}>@</span><span className="u">showroom-tpe-01</span><span style={{color:"var(--fg-3)"}}>:~$</span> <span className="c">_</span><span className="blink" /></div>
              </div>

              <aside className="tright">
                <div className="stat">
                  <div className="stat-l">本月成交金額</div>
                  <div className="stat-v">NT$ 14.82<span className="u">M</span></div>
                  <div className="stat-d">▲ 23.4% vs 上月</div>
                  <svg viewBox="0 0 200 36" preserveAspectRatio="none" style={{width:"100%", height:36, marginTop:6}}>
                    <defs><linearGradient id="sg1" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="currentColor" stopOpacity="0.35"/><stop offset="1" stopColor="currentColor" stopOpacity="0"/></linearGradient></defs>
                    <polyline style={{color:"var(--accent)"}} fill="url(#sg1)" stroke="none" points="0,28 15,25 30,23 45,26 60,19 75,17 90,20 105,13 120,11 135,14 150,9 165,7 180,8 200,3 200,36 0,36"/>
                    <polyline style={{color:"var(--accent)"}} fill="none" stroke="currentColor" strokeWidth="1.5" points="0,28 15,25 30,23 45,26 60,19 75,17 90,20 105,13 120,11 135,14 150,9 165,7 180,8 200,3"/>
                  </svg>
                </div>
                <div className="stat">
                  <div className="stat-l">管道健康度</div>
                  <div className="stat-v">91<span className="u">/100</span></div>
                  <div className="stat-d">▲ 6 pts · 無阻塞</div>
                </div>
                <div className="stat">
                  <div className="stat-l">今日派工</div>
                  <div className="stat-v">7<span className="u">/ 9</span></div>
                  <div className="stat-d w">● 2 待指派</div>
                </div>
                <div className="stat">
                  <div className="stat-l">客戶 NPS</div>
                  <div className="stat-v">+62</div>
                  <div className="stat-d">▲ 本季新高</div>
                </div>
              </aside>
            </div>
          </div>
        </section>

        {/* MARQUEE */}
        <div className="marquee">
          <div className="mtrack">
            <span>面對面銷售的作業系統<span className="dia">◆</span>CAR · HOUSE · BOAT · LUXURY · FURNITURE · AESTHETIC · BUILDING<span className="dia">◆</span>從商機到交付全鏈路<span className="dia">◆</span>不是 B2B 的 Salesforce<span className="dia">◆</span>是 B2C 展場的方法論<span className="dia">◆</span>v2.4.1 ready for production<span className="dia">◆</span></span>
            <span>面對面銷售的作業系統<span className="dia">◆</span>CAR · HOUSE · BOAT · LUXURY · FURNITURE · AESTHETIC · BUILDING<span className="dia">◆</span>從商機到交付全鏈路<span className="dia">◆</span>不是 B2B 的 Salesforce<span className="dia">◆</span>是 B2C 展場的方法論<span className="dia">◆</span>v2.4.1 ready for production<span className="dia">◆</span></span>
          </div>
        </div>

        {/* MANIFESTO */}
        <section>
          <div className="manifesto">
            <div className="kicker" style={{justifyContent:"center"}}>// MANIFESTO · 為什麼我們存在</div>
            <h2>
              Salesforce 是給 <span className="strike">IT 部門</span><br/>
              填表用的。DealerOS 是給<br/>
              <em>頂尖業務</em>拿來收單的。
            </h2>
          </div>
        </section>

        {/* FEATURES */}
        <section id="features">
          <div className="sec-w" style={{textAlign:"center"}}>
            <div className="kicker" style={{justifyContent:"center"}}>07 個核心模組 · 一張螢幕閉環</div>
            <h2 className="sec-title" style={{margin:"0 auto"}}>從陌生接觸到終身客戶，<br/><span className="dim">每一個轉折點都有跡可循。</span></h2>
            <p className="sec-sub" style={{margin:"20px auto 0"}}>展場型 B2C 銷售有它自己的節奏：人來了、走了、回來了、又走了。CRM 該幫你追節奏，而不是讓你追它。</p>
          </div>

          <div className="sec-w" style={{marginTop:72}}>
            <div className="features">
              <div className="feat">
                <div className="feat-num"><span>01 / LEAD</span><span className="tag">MODULE</span></div>
                <h3>商機管理<span className="en">Lead Capture</span></h3>
                <p>展場來客、廣告進線、老客轉介一個入口收攏。讓你第一時間知道 — 今天應該盯誰。</p>
                <ul><li>多通路進線合併去重</li><li>階段分層 × 停滯天數排序</li><li>OCR 掃名片／單據自動建檔</li></ul>
              </div>
              <div className="feat">
                <div className="feat-num"><span>02 / DEAL</span><span className="tag">MODULE</span></div>
                <h3>案件追蹤<span className="en">Deal Pipeline</span></h3>
                <p>看板式管道視圖 × 階段停滯預警。卡關的案子會主動推到你面前，絕不讓單子在角落發臭。</p>
                <ul><li>可自訂銷售階段</li><li>停滯自動升級提醒</li><li>團隊協作時間軸</li></ul>
              </div>
              <div className="feat">
                <div className="feat-num"><span>03 / PERSONA</span><span className="tag">MODULE</span></div>
                <h3>客戶畫像<span className="en">Customer Persona</span></h3>
                <p>把第一次見面聊的每個細節用結構化模板一次問完、一次記錄。方法論內建，菜鳥也照流程走。</p>
                <ul><li>可自訂欄位 + 標籤系統</li><li>身分證 / 駕照 OCR 掃描</li><li>跨案件畫像繼承</li></ul>
              </div>
              <div className="feat">
                <div className="feat-num"><span>04 / JOURNEY</span><span className="tag">MODULE</span></div>
                <h3>客戶歷程<span className="en">Customer Journey</span></h3>
                <p>每一通電話、每一次到店、每一則訊息 — 一條時間軸串起來，交接同事也能秒進狀況。</p>
                <ul><li>自動記錄 × 手動補登</li><li>檔案、合約、照片附件</li><li>關鍵事件重點標記</li></ul>
              </div>
              <div className="feat">
                <div className="feat-num"><span>05 / SERVICE</span><span className="tag">MODULE</span></div>
                <h3>維運管理<span className="en">After-Sale Service</span></h3>
                <p>成交不是終點，是複購的起點。保固、保養、耗材更換 — 系統會提前提醒客戶與負責業務。</p>
                <ul><li>保固 × 保養排程</li><li>SLA 違約警示</li><li>客戶滿意度追蹤</li></ul>
              </div>

              {/* 06 Dispatch FLAGSHIP */}
              <div className="feat flag" id="dispatch">
                <div className="feat-num"><span>06 / DISPATCH ★ 亮點</span><span className="tag">FLAGSHIP MODULE</span></div>
                <div className="flag-in">
                  <div>
                    <h3>派工系統<span className="en">Dispatch Operations</span></h3>
                    <p>這是我們跟一般 CRM 最大的分水嶺。銷售成交後，交車、安裝、維修、到府服務 — 誰去？何時去？帶什麼料？一張面板排好排滿，SLA 清清楚楚。</p>
                    <ul style={{marginTop:20}}>
                      <li>技師 × 車輛 × 工單 甘特式排程</li>
                      <li>地理最佳化派工（就近原則）</li>
                      <li>技師行動 App 簽到、拍照、回報</li>
                      <li>SLA 違約預警 × 自動重派</li>
                      <li>客戶端即時追蹤頁（Uber 式體驗）</li>
                    </ul>
                  </div>
                  <div className="dv">
                    <div className="dv-h"><span>DISPATCH BOARD · 2026/04/19</span><span className="live">● 7 ACTIVE</span></div>
                    {[
                      {av:"WC",name:"王總",color:"linear-gradient(135deg,#5BB8FF,#7CE38B)",task:"#8821 新車交車",l:"5%",w:"38%",bg:"#5BB8FF",st:"r",stl:"路途中"},
                      {av:"LM",name:"李明",color:"linear-gradient(135deg,#FFC857,#FF6B6B)",task:"#8817 到府保養",l:"20%",w:"50%",bg:"#FFC857",st:"b",stl:"作業中"},
                      {av:"JS",name:"陳俊",color:"linear-gradient(135deg,#9B6BFF,#5BB8FF)",task:"#8834 維修",l:"12%",w:"28%",bg:"#9B6BFF",st:"f",stl:"完成"},
                      {av:"HT",name:"黃婷",color:"linear-gradient(135deg,#7CE38B,#5BB8FF)",task:"#8841 檢測",l:"45%",w:"35%",bg:"#7CE38B",st:"b",stl:"作業中"},
                      {av:"ZW",name:"周偉",color:"linear-gradient(135deg,#FF6B6B,#FFC857)",task:"#8808 延遲 ⚠",l:"30%",w:"20%",bg:"#FF6B6B",st:"d",stl:"SLA 違約"},
                      {av:"KL",name:"柯倫",color:"linear-gradient(135deg,#5BB8FF,#9B6BFF)",task:"#8852 安裝",l:"55%",w:"30%",bg:"#5BB8FF",st:"r",stl:"路途中"},
                      {av:"PH",name:"彭浩",color:"linear-gradient(135deg,#7CE38B,#FFC857)",task:"#8860 驗收",l:"62%",w:"25%",bg:"#7CE38B",st:"f",stl:"待派"},
                    ].map((row) => (
                      <div className="dv-row" key={row.av}>
                        <div className="dv-tech"><span className="dv-av" style={{background:row.color}}>{row.av}</span>{row.name}</div>
                        <div className="dv-bar"><div className="dv-fill" style={{left:row.l,width:row.w,background:row.bg}}>{row.task}</div></div>
                        <div className={`dv-st ${row.st}`}>{row.stl}</div>
                      </div>
                    ))}
                    <div className="dv-now" />
                  </div>
                </div>
              </div>

              {/* 07 POS FLAGSHIP */}
              <div className="feat flag rev" id="pos">
                <div className="feat-num"><span>07 / POS PULSE ★ 亮點</span><span className="tag">FLAGSHIP MODULE</span></div>
                <div className="flag-in">
                  <div className="pos">
                    <div className="pos-h"><span>POS · 即時銷售脈動</span><span className="live">● LIVE · 14:32:07</span></div>
                    <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:20}}>
                      <div>
                        <div className="l" style={{fontSize:"10.5px",color:"var(--fg-3)",letterSpacing:"0.1em",textTransform:"uppercase",marginBottom:4}}>今日營業額</div>
                        <div style={{fontSize:22,fontWeight:500,letterSpacing:"-0.015em"}}>NT$ 2.14<span style={{fontSize:11,color:"var(--fg-2)",marginLeft:3}}>M</span><span style={{fontSize:"10.5px",color:"var(--live)",marginLeft:8}}>▲ 18%</span></div>
                      </div>
                      <div style={{textAlign:"right"}}>
                        <div style={{fontSize:"10.5px",color:"var(--fg-3)",letterSpacing:"0.1em",textTransform:"uppercase",marginBottom:4}}>轉換率</div>
                        <div style={{fontSize:22,fontWeight:500,letterSpacing:"-0.015em"}}>23.4<span style={{fontSize:11,color:"var(--fg-2)",marginLeft:3}}>%</span><span style={{fontSize:"10.5px",color:"var(--live)",marginLeft:8}}>▲ 2.1</span></div>
                      </div>
                      <div>
                        <div style={{fontSize:"10.5px",color:"var(--fg-3)",letterSpacing:"0.1em",textTransform:"uppercase",marginBottom:4}}>客單價</div>
                        <div style={{fontSize:22,fontWeight:500}}>NT$ 187<span style={{fontSize:11,color:"var(--fg-2)",marginLeft:3}}>K</span></div>
                      </div>
                      <div style={{textAlign:"right"}}>
                        <div style={{fontSize:"10.5px",color:"var(--fg-3)",letterSpacing:"0.1em",textTransform:"uppercase",marginBottom:4}}>來客數</div>
                        <div style={{fontSize:22,fontWeight:500}}>42<span style={{fontSize:"10.5px",color:"var(--danger)",marginLeft:8}}>▼ 3</span></div>
                      </div>
                    </div>
                    <div className="pos-chart">
                      <div style={{fontSize:"10.5px",color:"var(--fg-3)",letterSpacing:"0.12em",textTransform:"uppercase",marginBottom:10,display:"flex",justifyContent:"space-between"}}>
                        <span>營收 × 毛利 · 過去 14 天</span>
                        <span><span style={{color:"var(--accent)"}}>— 營收</span>&nbsp;<span style={{color:"var(--live)"}}>-- 毛利</span></span>
                      </div>
                      <svg viewBox="0 0 400 120" preserveAspectRatio="none" style={{width:"100%",height:130}}>
                        <defs><linearGradient id="pg1" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="currentColor" stopOpacity="0.35"/><stop offset="1" stopColor="currentColor" stopOpacity="0"/></linearGradient></defs>
                        <g stroke="oklch(1 0 0 / 0.06)" strokeWidth="1"><line x1="0" y1="24" x2="400" y2="24"/><line x1="0" y1="60" x2="400" y2="60"/><line x1="0" y1="96" x2="400" y2="96"/></g>
                        <polyline style={{color:"var(--accent)"}} fill="url(#pg1)" stroke="none" points="0,82 30,74 60,80 90,67 120,72 150,60 180,64 210,50 240,54 270,40 300,44 330,32 360,36 400,22 400,120 0,120"/>
                        <polyline style={{color:"var(--accent)"}} fill="none" stroke="currentColor" strokeWidth="1.8" points="0,82 30,74 60,80 90,67 120,72 150,60 180,64 210,50 240,54 270,40 300,44 330,32 360,36 400,22"/>
                        <polyline style={{color:"var(--live)"}} fill="none" stroke="currentColor" strokeWidth="1.6" strokeDasharray="3 3" points="0,94 30,88 60,90 90,80 120,84 150,74 180,76 210,66 240,68 270,58 300,60 330,52 360,54 400,44"/>
                        <g fontFamily="JetBrains Mono" fontSize="8" fill="oklch(0.56 0.012 255)"><text x="0" y="116">4/05</text><text x="200" y="116" textAnchor="middle">4/12</text><text x="400" y="116" textAnchor="end">4/19</text></g>
                      </svg>
                    </div>
                  </div>
                  <div>
                    <h3>POS 銷售管理分析<span className="en">POS Pulse</span></h3>
                    <p>不只是結帳工具。每一筆交易自動串回商機、業務、產品、通路 — 即時告訴你：哪個業務在賺錢？哪個產品在爆款？哪個時段需要加人？</p>
                    <ul style={{marginTop:20}}>
                      <li>毛利 × 淨利即時儀表板</li>
                      <li>業務 × 產品 × 時段交叉分析</li>
                      <li>熱賣 / 滯銷 SKU 自動識別</li>
                      <li>金流串接（信用卡、Line Pay、分期）</li>
                      <li>每日收班一鍵結算報表</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* PROCESS */}
        <section id="process" style={{background:"linear-gradient(180deg, transparent, oklch(0.17 0.013 255 / 0.6))"}}>
          <div className="sec-w">
            <div className="process">
              <div className="proc-stage">
                <div className="kicker">一條龍流程</div>
                <h2 className="sec-title">從「有人走進展場」<br/>到「他推薦朋友再買一台」— <span className="dim">中間每一步我們都幫你跑過。</span></h2>
                <p className="sec-sub">DealerOS 不是把 CRM 的框搬到展場 — 我們重新設計了 B2C 面對面交易的作業流程，把 7 個模組縫成一條閉環。</p>
              </div>
              <div className="proc-steps">
                {PROCESS_STEPS.map((step, i) => (
                  <div
                    key={step.num}
                    className={`pstep${openStep === i ? " open" : ""}`}
                    onClick={() => setOpenStep(openStep === i ? -1 : i)}
                  >
                    <div className="pstep-h">
                      <span className="pstep-n">{step.num}</span>
                      <span className="pstep-t">{step.title}</span>
                      <span className="pstep-a">→</span>
                    </div>
                    <div className="pstep-b">
                      {step.body}
                      <div className="tech">
                        {step.tech.map((t) => <span key={t}>{t}</span>)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* COMPARISON */}
        <section id="why">
          <div className="sec-w" style={{textAlign:"center", marginBottom:64}}>
            <div className="kicker" style={{justifyContent:"center"}}>為什麼不是 Salesforce？</div>
            <h2 className="sec-title" style={{margin:"0 auto"}}>B2B 的表單機器，<br/>放到展場會 <span className="dim">水土不服</span>。</h2>
          </div>
          <div className="compare">
            <div className="col bad">
              <div className="col-k">通用 B2B CRM</div>
              <h4>給 <span className="dim">工程師</span> 和 <span className="dim">遠端業務</span> 設計的</h4>
              <ul>
                <li>為 Email × Zoom 循環設計 — 展場的面對面節奏對不上</li>
                <li>派工？那是另外一套 FSM 系統，你要再買再整合</li>
                <li>POS 銷售？需要再接第三方工具，對帳各做各的</li>
                <li>學習曲線陡峭，業務第一反應是「我幹嘛填這個？」</li>
                <li>實施要 6 個月 + 一個顧問團隊</li>
                <li>月費以「座位」計價 — 你的小展場 3 個人用不起</li>
              </ul>
            </div>
            <div className="col good">
              <div className="col-k">DealerOS</div>
              <h4>給 <span className="dim">展場業務</span> 設計的 <em style={{color:"var(--accent)",fontStyle:"italic"}}>方法論作業系統</em></h4>
              <ul>
                <li>整個 UX 為「面對面 × 當下成交」設計 — 無分心欄位</li>
                <li>派工是一等公民 — 不是加購模組，是內建閉環</li>
                <li>POS 原生整合 — 每筆交易自動回填商機與業務數據</li>
                <li>把頂尖業務的 SOP 寫進流程 — 新人照跑就出成績</li>
                <li>週二簽約 → 週一開賣 — 新業務 15 分鐘上手</li>
                <li>行業專用定價 — 不為你用不到的功能付錢</li>
              </ul>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="cta-sec">
          <div className="sec-w">
            <div className="kicker" style={{justifyContent:"center"}}>READY TO DEPLOY</div>
            <h2>你的下一筆成交，<br/>少 <em>3 次</em>電話、<em>2 次</em>失眠。</h2>
            <div className="cta-row" style={{marginBottom:0}}>
              <Link className="btn btn-primary" href="/login">⌘ 進入 DealerOS →</Link>
              <a className="btn btn-ghost" href="#features">預約 Demo</a>
            </div>
          </div>
        </section>

        <footer>
          <div className="ld-logo"><span className="ld-logo-dot" /><span>DEALER<b>OS</b></span><span className="ver">/ © 2026</span></div>
          <div className="fl">
            <a href="#features">Features</a>
            <a href="#process">Process</a>
            <a href="#why">Why DealerOS</a>
          </div>
          <div style={{color:"var(--fg-3)"}}>Built for operators, not administrators.</div>
        </footer>
      </main>
    </div>
  );
}

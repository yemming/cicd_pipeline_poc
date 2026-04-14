"use client";

import { useSetPageHeader } from "@/components/page-header-context";

export default function D2CHomePage() {
  useSetPageHeader({
    title: "消費者首頁",
    breadcrumb: [{ label: "直銷官網", href: "/d2c/home" }, { label: "消費者首頁" }],
  });

  return (
    <div
      className="-m-4 md:-m-8"
      style={{ background: "#050505", color: "#e5e2e1", fontFamily: "Inter, 'Noto Sans TC', sans-serif" }}
    >
      <style>{`
        .d2c-glass-nav {
          background: rgba(5, 5, 5, 0.6);
          backdrop-filter: blur(24px);
          -webkit-backdrop-filter: blur(24px);
        }
        .d2c-material {
          font-variation-settings: 'FILL' 0, 'wght' 300, 'GRAD' 0, 'opsz' 24;
        }
        .d2c-neon-glow:hover {
          box-shadow: 0 0 15px rgba(227, 24, 55, 0.4);
        }
        .d2c-card-hover {
          transition: transform 0.5s ease;
        }
        .d2c-card-hover:hover {
          transform: scale(1.02);
        }
        .d2c-card-hover:hover .d2c-card-img {
          transform: scale(1.1);
        }
        .d2c-card-img {
          transition: transform 0.7s ease;
        }
        .d2c-card-hover:hover .d2c-card-border {
          border-color: rgba(227, 24, 55, 0.4);
        }
        .d2c-card-border {
          border: 1px solid transparent;
          transition: border-color 0.5s;
        }
        .d2c-step-circle:hover {
          border-color: #e31837;
          box-shadow: 0 0 20px rgba(227, 24, 55, 0.3);
        }
        .d2c-step-circle:hover .d2c-step-icon {
          color: #e31837;
        }
        .d2c-step-circle {
          transition: border-color 0.5s, box-shadow 0.5s;
        }
        .d2c-step-icon {
          transition: color 0.5s;
        }
        .d2c-nav-link {
          transition: color 0.3s;
        }
        .d2c-nav-link:hover {
          color: white;
        }
        .d2c-footer-link {
          transition: color 0.2s;
        }
        .d2c-footer-link:hover {
          color: #dc2626;
        }
        .d2c-finance-btn:hover {
          background: #e31837;
          color: white;
        }
        .d2c-finance-btn {
          transition: background 0.5s, color 0.5s;
        }
      `}</style>

      {/* ── TopNav ──────────────────────────────────────────────── */}
      <nav
        className="w-full border-b d2c-glass-nav"
        style={{ borderColor: "rgba(255,255,255,0.1)", boxShadow: "0 25px 50px -12px rgba(0,0,0,0.5)" }}
      >
        <div className="flex justify-between items-center px-12 py-4 w-full">
          <div
            style={{
              fontSize: "1.5rem",
              fontFamily: "Manrope, 'Noto Sans TC', sans-serif",
              fontWeight: 900,
              fontStyle: "italic",
              letterSpacing: "-0.05em",
              color: "#dc2626",
              transition: "transform 0.2s",
              cursor: "pointer",
            }}
            onMouseOver={(e) => (e.currentTarget.style.transform = "scale(1.05)")}
            onMouseOut={(e) => (e.currentTarget.style.transform = "scale(1)")}
          >
            DUCATI
          </div>
          <div
            className="hidden md:flex items-center"
            style={{ gap: "2.5rem", fontFamily: "Manrope, 'Noto Sans TC', sans-serif", fontWeight: 800, fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.1em" }}
          >
            <a href="#" style={{ color: "#dc2626", borderBottom: "2px solid #dc2626", paddingBottom: "0.25rem" }}>車系車款</a>
            <a href="#" className="d2c-nav-link" style={{ color: "rgba(255,255,255,0.8)" }}>賽道競技</a>
            <a href="#" className="d2c-nav-link" style={{ color: "rgba(255,255,255,0.8)" }}>SCRAMBLER</a>
            <a href="#" className="d2c-nav-link" style={{ color: "rgba(255,255,255,0.8)" }}>精品服飾</a>
            <a href="#" className="d2c-nav-link" style={{ color: "rgba(255,255,255,0.8)" }}>售後服務</a>
          </div>
          <div className="flex items-center" style={{ gap: "1.5rem" }}>
            <button
              className="material-symbols-outlined d2c-material d2c-nav-link"
              style={{ color: "rgba(255,255,255,0.8)", background: "none", border: "none", cursor: "pointer", fontSize: "24px" }}
            >shopping_cart</button>
            <button
              className="material-symbols-outlined d2c-material d2c-nav-link"
              style={{ color: "rgba(255,255,255,0.8)", background: "none", border: "none", cursor: "pointer", fontSize: "24px" }}
            >person</button>
          </div>
        </div>
      </nav>

      {/* ── Hero ────────────────────────────────────────────────── */}
      <section style={{ position: "relative", height: "100vh", width: "100%", display: "flex", alignItems: "center", overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0, zIndex: 0 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            alt="Close-up of a Ducati Panigale V4 S in a dark studio, dramatic rim lighting highlighting the sharp aerodynamic lines and carbon fiber textures"
            src="https://lh3.googleusercontent.com/aida-public/AB6AXuDxfHIbTd4RG1CU8vRFyQ4uOHUlv5HMliFp7U1NLDicCEfb5fYMl8vFG8Zi0HweCB3zq9nTOtd330jeJNy1E4AFwFXa_fQmZ_tWryNNaJ-VA_aD2q5YaMmLNEVsRLSf5ixSa0Nl0KiLxkaOB5JOcqrPkKmUHj9siDAxb76Ovt4ZYvZ-AULDvsm6fNPdOGupQqMA65zj3dfFugX-Jj_Ee10P3sMX6iPYeA-77ogm6sa6QmsqNxD9ErZGNhBTADAVB9dLkxojKtuLO_M"
            style={{ width: "100%", height: "100%", objectFit: "cover", filter: "grayscale(100%)", opacity: 0.6 }}
          />
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to right, #050505, transparent)" }} />
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, #050505, transparent)" }} />
        </div>
        <div style={{ position: "relative", zIndex: 10, paddingLeft: "3rem", paddingRight: "3rem", maxWidth: "56rem" }}>
          <h1
            style={{
              fontFamily: "Manrope, 'Noto Sans TC', sans-serif",
              fontSize: "clamp(3rem, 8vw, 6rem)",
              fontWeight: 800,
              letterSpacing: "-0.05em",
              color: "white",
              lineHeight: 1.1,
              textTransform: "uppercase",
            }}
          >
            巔峰之戰<br />
            <span style={{ color: "#e31837" }}>暗黑覺醒</span>
          </h1>
          <p style={{ marginTop: "1.5rem", fontSize: "1.25rem", fontWeight: 300, color: "#e6bdbb", maxWidth: "36rem" }}>
            精準性能，無可匹敵的靈魂。來自義大利工藝的極致結晶，在陰影中重塑性能巔峰。
          </p>
          <div style={{ marginTop: "3rem", display: "flex", flexWrap: "wrap", gap: "1.5rem" }}>
            <button
              className="d2c-neon-glow"
              style={{
                background: "#e31837",
                color: "white",
                padding: "1.25rem 2.5rem",
                fontFamily: "Manrope, 'Noto Sans TC', sans-serif",
                fontWeight: 800,
                textTransform: "uppercase",
                letterSpacing: "0.1em",
                fontSize: "0.875rem",
                border: "none",
                cursor: "pointer",
                transition: "background 0.3s",
              }}
            >
              立即感受腎上腺素
            </button>
            <button
              style={{
                border: "1px solid rgba(255,255,255,0.2)",
                background: "rgba(255,255,255,0.05)",
                backdropFilter: "blur(12px)",
                color: "white",
                padding: "1.25rem 2.5rem",
                fontFamily: "Manrope, 'Noto Sans TC', sans-serif",
                fontWeight: 800,
                textTransform: "uppercase",
                letterSpacing: "0.1em",
                fontSize: "0.875rem",
                cursor: "pointer",
                transition: "background 0.3s",
              }}
            >
              查看技術規格
            </button>
          </div>
        </div>
      </section>

      {/* ── Featured Models ─────────────────────────────────────── */}
      <section style={{ padding: "8rem 3rem", background: "#0e0e0e" }}>
        <div style={{ maxWidth: "80rem", margin: "0 auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: "5rem" }}>
            <div>
              <span style={{ color: "#ffb3b1", fontFamily: "Manrope", textTransform: "uppercase", letterSpacing: "0.3em", fontSize: "0.75rem", fontWeight: 700 }}>傳奇陣容</span>
              <h2 style={{ fontSize: "clamp(2rem, 4vw, 3rem)", fontFamily: "Manrope, 'Noto Sans TC', sans-serif", fontWeight: 800, color: "white", marginTop: "0.5rem" }}>極致工藝之作</h2>
            </div>
            <div className="hidden md:block" style={{ height: "1px", flexGrow: 1, margin: "0 3rem", background: "rgba(255,255,255,0.1)" }} />
            <a href="#" style={{ color: "#e6bdbb", textTransform: "uppercase", letterSpacing: "0.1em", fontSize: "0.75rem", fontWeight: 700, textDecoration: "none" }}>探索全部</a>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "2rem" }}>
            {[
              {
                img: "https://lh3.googleusercontent.com/aida-public/AB6AXuBF4hRhm-6ZeaRHphGaSZegdBPB9DpeGY8srwwQH15epJKWqN4fMYCAMt4Sd2mA6pkGziP255MGlog46V8ryOcKpx49x9f-qaKi3Iz8_fiy2_fCFpNyaqLyox_0aWtKHfQ9bMwrI6RIt-Gfk2SXhx8sw8pMadQyWEDUenymV6mzb8LlUQey1rZ9GRVMg8MpJTkLCc20vNZEkz5VRbgxFgN44VQKI2-B0bfrPsQcV81wYQLlkLfXNUGICjCvhe5F6rSZItQhcM47h2c",
                alt: "Ducati Panigale V4 in a dark garage, single spotlight highlighting the red fairings and mechanical components",
                name: "PANIGALE",
                sub: "賽道霸主：純粹競技基因",
                offset: false,
              },
              {
                img: "https://lh3.googleusercontent.com/aida-public/AB6AXuC3DqD_vE_yuHP1MCdhs5orDtfyQ0p2_eIXV4MVAaBY4ZmHqxjzM9x-W_vF-OilaAdINEHpatwXT3eVwwlcX3Yj9Doev76_cjPLtYlC-jBVGEZyAunOk0qvNUnPorfeVRq57L8r2kd3RJokcQfIDkloiCj99I-tLp0w-aJVmzAxOdjcZDhwAXKvTZtU7_1wu1Jv6iloZlKV7k637YKP5Y6QBhCGggH5ZnHutECgaeKoIrZsK3a0D6IWdFMUwMuJ4zbFE5oXyK39V6o",
                alt: "Ducati Multistrada in a rugged twilight landscape, headlights cutting through mist",
                name: "MULTISTRADA",
                sub: "地表征服：無界探索之魂",
                offset: true,
              },
              {
                img: "https://lh3.googleusercontent.com/aida-public/AB6AXuC4PygW3CgJiYvXTa4THdwr7oc4QfWQ68mKAWLA2jMh-iJ668pAUTWMszhJ1qaIPTw08O7-J7IQhLhHK9AjYQishLzwhKdIT_Wi73k4uDYczqqQRl-2zAdJeEoxaF14CmLayBgQjxt7PUtAzczqeGdke8wpWA0RCRmY_wLDQgXNABlIWE-QcJSgSF4r3I5ZesGQjw2ynIhtxEvyYJIIABnJscCgNOQ6hHKTv3ZvR6yGWzLOJWjzb8eJjsDf18mrajdD7vNy5RUAfIU",
                alt: "Ducati Monster naked bike, high contrast black and white lighting",
                name: "MONSTER",
                sub: "赤裸野性：都市獵殺者",
                offset: false,
              },
            ].map((m) => (
              <div
                key={m.name}
                className="d2c-card-hover"
                style={{ background: "#1c1b1b", padding: "4px", position: "relative", marginTop: m.offset ? "3rem" : 0 }}
              >
                <div className="d2c-card-border" style={{ position: "absolute", inset: 0 }} />
                <div style={{ position: "relative", background: "#0a0a0a", overflow: "hidden", aspectRatio: "3/4" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    alt={m.alt}
                    src={m.img}
                    className="d2c-card-img"
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  />
                  <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, black, transparent)", opacity: 0.8 }} />
                  <div style={{ position: "absolute", bottom: "2rem", left: "2rem" }}>
                    <h3 style={{ fontSize: "1.875rem", fontFamily: "Manrope", fontWeight: 800, color: "white" }}>{m.name}</h3>
                    <p style={{ color: "#e31837", fontSize: "0.75rem", fontWeight: 700, letterSpacing: "0.2em", marginTop: "0.5rem" }}>{m.sub}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Online Process ──────────────────────────────────────── */}
      <section style={{ padding: "8rem 0", background: "#050505" }}>
        <div style={{ maxWidth: "80rem", margin: "0 auto", padding: "0 3rem" }}>
          <div style={{ textAlign: "center", marginBottom: "6rem" }}>
            <h2 style={{ fontSize: "clamp(1.75rem, 3vw, 2.5rem)", fontFamily: "Manrope, 'Noto Sans TC', sans-serif", fontWeight: 800, color: "white", marginBottom: "1rem" }}>數位車庫：極簡購車體驗</h2>
            <div style={{ width: "6rem", height: "4px", background: "#e31837", margin: "0 auto" }} />
            <p style={{ marginTop: "1.5rem", color: "#e6bdbb", maxWidth: "32rem", margin: "1.5rem auto 0", textTransform: "uppercase", letterSpacing: "0.1em", fontSize: "0.75rem", fontWeight: 700 }}>流暢無阻的車主旅程</p>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "3rem" }}>
            {[
              { icon: "settings_suggest", title: "專屬配置", desc: "使用頂級配件打造您的夢幻 Ducati。" },
              { icon: "payments",         title: "金融方案", desc: "透過 Ducati 財務服務獲取即時彈性審核。" },
              { icon: "fact_check",       title: "數位簽約", desc: "透過安全數位簽約完成您的購車流程。" },
              { icon: "delivery_dining",  title: "尊榮交付", desc: "白手套級專業配送，直達您的府上。" },
            ].map((s) => (
              <div key={s.title} style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
                <div
                  className="d2c-step-circle"
                  style={{ width: "4rem", height: "4rem", borderRadius: "50%", border: "1px solid rgba(255,255,255,0.1)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "2rem" }}
                >
                  <span className="material-symbols-outlined d2c-material d2c-step-icon" style={{ fontSize: "1.875rem", color: "white" }}>{s.icon}</span>
                </div>
                <h4 style={{ color: "white", fontFamily: "Manrope", fontWeight: 700, fontSize: "1.125rem", marginBottom: "1rem" }}>{s.title}</h4>
                <p style={{ color: "#e6bdbb", fontSize: "0.875rem", lineHeight: 1.6 }}>{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Finance Estimator ───────────────────────────────────── */}
      <section style={{ padding: "8rem 3rem", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0, zIndex: 0 }}>
          <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", width: "800px", height: "800px", background: "rgba(227,24,55,0.05)", borderRadius: "50%", filter: "blur(120px)" }} />
        </div>
        <div style={{ maxWidth: "64rem", margin: "0 auto", position: "relative", zIndex: 10 }}>
          <div style={{ background: "rgba(42,42,42,0.4)", backdropFilter: "blur(48px)", padding: "3rem", border: "1px solid rgba(255,255,255,0.05)" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "4rem" }}>
              <div>
                <h2 style={{ fontSize: "clamp(1.75rem, 3vw, 2.5rem)", fontFamily: "Manrope, 'Noto Sans TC', sans-serif", fontWeight: 800, color: "white", lineHeight: 1.25 }}>
                  成就卓越：您的<br />專屬圓夢計畫
                </h2>
                <p style={{ marginTop: "1.5rem", color: "#e6bdbb" }}>計算您的每月性能投資。無隱藏費用，只有純粹的馳騁快感。</p>
                <div style={{ marginTop: "3rem" }}>
                  <div style={{ marginBottom: "2rem" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "1rem" }}>
                      <span style={{ fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.1em", color: "rgba(255,255,255,0.6)" }}>首期付款</span>
                      <span style={{ color: "white", fontFamily: "Manrope", fontWeight: 700 }}>$12,000</span>
                    </div>
                    <input type="range" style={{ width: "100%", height: "4px", background: "rgba(255,255,255,0.1)", appearance: "none", cursor: "pointer", accentColor: "#e31837" }} />
                  </div>
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "1rem" }}>
                      <span style={{ fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.1em", color: "rgba(255,255,255,0.6)" }}>合約期限 (月)</span>
                      <span style={{ color: "white", fontFamily: "Manrope", fontWeight: 700 }}>48</span>
                    </div>
                    <div style={{ display: "flex", gap: "1rem" }}>
                      <button style={{ flex: 1, padding: "0.75rem", background: "#e31837", fontSize: "0.75rem", fontWeight: 700, border: "none", cursor: "pointer", color: "white" }}>36</button>
                      <button style={{ flex: 1, padding: "0.75rem", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", fontSize: "0.75rem", fontWeight: 700, cursor: "pointer", color: "white" }}>48</button>
                      <button style={{ flex: 1, padding: "0.75rem", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", fontSize: "0.75rem", fontWeight: 700, cursor: "pointer", color: "white" }}>60</button>
                    </div>
                  </div>
                </div>
              </div>

              <div style={{ background: "rgba(0,0,0,0.4)", padding: "2.5rem", display: "flex", flexDirection: "column", justifyContent: "center", borderLeft: "1px solid rgba(255,255,255,0.05)" }}>
                <span style={{ fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.1em", color: "#e31837", fontWeight: 700, marginBottom: "0.5rem" }}>預估每月付款額</span>
                <div style={{ fontSize: "4.5rem", fontFamily: "Manrope", fontWeight: 800, color: "white", marginBottom: "2rem", lineHeight: 1 }}>
                  $489<span style={{ fontSize: "1.25rem", color: "rgba(255,255,255,0.4)", marginLeft: "0.5rem" }}>/月</span>
                </div>
                <ul style={{ listStyle: "none", padding: 0, margin: "0 0 2.5rem 0", display: "flex", flexDirection: "column", gap: "1rem" }}>
                  {["3.9% APR 優惠利率", "3 年免費保養服務", "未來保證價值承諾"].map((item) => (
                    <li key={item} style={{ display: "flex", alignItems: "center", gap: "0.75rem", fontSize: "0.875rem", color: "#e6bdbb" }}>
                      <span className="material-symbols-outlined d2c-material" style={{ color: "#ffb3b1", fontSize: "1rem" }}>check_circle</span>
                      {item}
                    </li>
                  ))}
                </ul>
                <button
                  className="d2c-finance-btn"
                  style={{ width: "100%", background: "white", color: "black", padding: "1.25rem", fontFamily: "Manrope", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.1em", fontSize: "0.75rem", border: "none", cursor: "pointer" }}
                >
                  立即獲取預審
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Footer ──────────────────────────────────────────────── */}
      <footer style={{ width: "100%", paddingTop: "6rem", paddingBottom: "3rem", background: "#050505" }}>
        <div style={{ maxWidth: "80rem", margin: "0 auto", padding: "0 3rem", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "3rem" }}>
          <div>
            <div style={{ fontSize: "1.25rem", fontWeight: 900, color: "white", marginBottom: "2rem" }}>DUCATI</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "2rem", fontFamily: "Inter", fontSize: "0.75rem", letterSpacing: "-0.01em", textTransform: "uppercase" }}>
              {["隱私權政策", "Cookie 政策", "使用條款", "公司資料", "聯絡我們"].map((label) => (
                <a key={label} href="#" className="d2c-footer-link" style={{ color: "#71717a", textDecoration: "none" }}>{label}</a>
              ))}
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", justifyContent: "flex-end" }}>
            <p style={{ fontFamily: "Inter", fontSize: "0.625rem", letterSpacing: "-0.01em", textTransform: "uppercase", color: "#71717a", lineHeight: 1.6, textAlign: "right", maxWidth: "28rem", opacity: 0.8 }}>
              © 2024 Ducati Motor Holding S.p.A - 獨資公司 - AUDI AG 管理與協調下之企業。保留所有權利。
            </p>
            <div style={{ marginTop: "2rem", display: "flex", gap: "1.5rem" }}>
              {["language", "share"].map((icon) => (
                <span
                  key={icon}
                  className="material-symbols-outlined d2c-material d2c-footer-link"
                  style={{ color: "rgba(255,255,255,0.4)", cursor: "pointer" }}
                >{icon}</span>
              ))}
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

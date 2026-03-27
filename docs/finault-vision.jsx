import { useState } from "react";

export default function FinaultVision() {
  const [active, setActive] = useState("overview");

  const sections = [
    { id: "overview", label: "The Vision" },
    { id: "index", label: "The Index" },
    { id: "verified", label: "Verified" },
    { id: "os", label: "The OS" },
    { id: "flywheel", label: "The Flywheel" },
  ];

  return (
    <div style={{ minHeight: "100vh", background: "#000", color: "#e4e4e7", fontFamily: "'JetBrains Mono', monospace" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700;800&family=Instrument+Serif:ital@0;1&display=swap');
        @keyframes fadeIn { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
        ::selection { background: #22c55e30; }
        * { box-sizing: border-box; margin: 0; padding: 0; }
      `}</style>

      {/* Nav */}
      <nav style={{ padding: "20px 32px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #111" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#22c55e", boxShadow: "0 0 12px #22c55e60" }} />
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2.5 }}>FINAULT</span>
        </div>
        <div style={{ display: "flex", gap: 2 }}>
          {sections.map(s => (
            <button key={s.id} onClick={() => setActive(s.id)} style={{
              padding: "6px 16px", borderRadius: 4, fontSize: 10, fontWeight: 600, letterSpacing: 0.5,
              background: active === s.id ? "#fff" : "transparent",
              color: active === s.id ? "#000" : "#525252",
              border: "none", cursor: "pointer", fontFamily: "inherit",
            }}>{s.label}</button>
          ))}
        </div>
      </nav>

      <div style={{ maxWidth: 800, margin: "0 auto", padding: "60px 28px 120px" }}>

        {/* ═══ OVERVIEW ═══ */}
        {active === "overview" && (
          <div style={{ animation: "fadeIn 0.5s ease-out" }}>
            <p style={{ fontFamily: "'Instrument Serif', serif", fontSize: 48, lineHeight: 1.15, color: "#fafafa", marginBottom: 32, fontStyle: "italic" }}>
              A financial institution<br />for the AI economy.
            </p>
            <p style={{ fontSize: 14, color: "#71717a", lineHeight: 1.9, marginBottom: 48, maxWidth: 600 }}>
              Finault is not a dashboard. Not an observability tool. Not a cost tracker. Finault is the financial infrastructure that makes the AI economy legible, accountable, and provable.
            </p>

            {/* Three pillars */}
            <div style={{ display: "grid", gap: 20, marginBottom: 60 }}>
              {[
                {
                  num: "I",
                  title: "The Finault Index",
                  sub: "The authoritative source of truth about AI economics",
                  desc: "A public, real-time index of AI costs, margins, and efficiency — aggregated from every company on the network. The S&P 500 of AI economics. Free to read. Requires Finault to see how you compare.",
                  color: "#22c55e",
                },
                {
                  num: "II",
                  title: "Finault Verified",
                  sub: "The market credential for AI financial credibility",
                  desc: "6+ months of sealed data. Finault Score above 60. Unbroken chain. A badge that tells investors, customers, and auditors: our AI economics are documented, sealed, and independently verifiable.",
                  color: "#f59e0b",
                },
                {
                  num: "III",
                  title: "The AI Financial Operating System",
                  sub: "The single pane of glass for all AI financial decisions",
                  desc: "Budget. Allocate. Invoice. Negotiate. Report. Prove. Every financial operation for AI in one system. Like Stripe for payments — once you're on it, going back to spreadsheets is unthinkable.",
                  color: "#6366f1",
                },
              ].map((p, i) => (
                <div key={i} onClick={() => setActive(p.num === "I" ? "index" : p.num === "II" ? "verified" : "os")} style={{
                  padding: 32, background: "#0a0a0a", borderRadius: 8,
                  border: `1px solid ${p.color}20`, cursor: "pointer",
                  transition: "border-color 0.3s",
                }}
                onMouseEnter={e => e.currentTarget.style.borderColor = p.color + "60"}
                onMouseLeave={e => e.currentTarget.style.borderColor = p.color + "20"}
                >
                  <div style={{ display: "flex", alignItems: "baseline", gap: 16, marginBottom: 12 }}>
                    <span style={{ fontFamily: "'Instrument Serif', serif", fontSize: 28, color: p.color, fontStyle: "italic" }}>{p.num}</span>
                    <span style={{ fontSize: 18, fontWeight: 800, color: "#fafafa" }}>{p.title}</span>
                  </div>
                  <div style={{ fontSize: 12, color: p.color, fontWeight: 600, marginBottom: 8 }}>{p.sub}</div>
                  <div style={{ fontSize: 13, color: "#71717a", lineHeight: 1.8 }}>{p.desc}</div>
                </div>
              ))}
            </div>

            {/* The tagline */}
            <div style={{ padding: 32, background: "#0a0a0a", borderRadius: 8, border: "1px solid #1c1c1e", textAlign: "center" }}>
              <p style={{ fontSize: 13, color: "#525252", lineHeight: 1.8, marginBottom: 16 }}>
                Helicone, Langfuse, Braintrust, Datadog — they track costs.<br />
                Stripe, Chargebee, Metronome — they track revenue.<br />
                Nobody connects them. Nobody computes the truth.
              </p>
              <p style={{ fontFamily: "'Instrument Serif', serif", fontSize: 28, color: "#fafafa", fontStyle: "italic" }}>
                Finault tracks profitability.
              </p>
            </div>
          </div>
        )}

        {/* ═══ THE INDEX ═══ */}
        {active === "index" && (
          <div style={{ animation: "fadeIn 0.5s ease-out" }}>
            <div style={{ fontSize: 10, letterSpacing: 2.5, color: "#22c55e", marginBottom: 12, fontWeight: 700 }}>PILLAR I</div>
            <p style={{ fontFamily: "'Instrument Serif', serif", fontSize: 40, lineHeight: 1.15, color: "#fafafa", marginBottom: 12, fontStyle: "italic" }}>
              The Finault Index
            </p>
            <p style={{ fontSize: 14, color: "#22c55e", marginBottom: 32 }}>The authoritative source of truth about AI economics.</p>

            <p style={{ fontSize: 13, color: "#a1a1aa", lineHeight: 1.9, marginBottom: 32 }}>
              A public, real-time index of AI economics across the industry. Anonymized and aggregated from every company on the Finault network. Published monthly. Updated daily at scale. Free to read. The only place on earth where the true economics of AI are visible.
            </p>

            {/* Sample index data */}
            <div style={{ background: "#0a0a0a", borderRadius: 8, border: "1px solid #1c1c1e", padding: 28, marginBottom: 24 }}>
              <div style={{ fontSize: 9, letterSpacing: 2, color: "#525252", marginBottom: 16 }}>FINAULT INDEX — MARCH 2026 (SAMPLE)</div>
              {[
                { metric: "Median cost per AI API call", value: "$0.0142", change: "-24.8%", changeColor: "#22c55e", period: "vs. 6mo ago" },
                { metric: "Median gross margin (SaaS + AI features)", value: "62.3%", change: "-1.8pts", changeColor: "#ef4444", period: "vs. last quarter" },
                { metric: "% of companies with underwater customers", value: "41%", change: "+6%", changeColor: "#ef4444", period: "vs. last quarter" },
                { metric: "Median cost-to-serve per customer (B2B SaaS)", value: "$14.20/mo", change: "-8.3%", changeColor: "#22c55e", period: "vs. 6mo ago" },
                { metric: "Companies using model routing", value: "23%", change: "+11%", changeColor: "#22c55e", period: "vs. last quarter" },
                { metric: "Avg savings from model optimization", value: "31%", change: "", changeColor: "#71717a", period: "of total AI spend" },
                { metric: "Median Finault Score", value: "64", change: "+3", changeColor: "#22c55e", period: "vs. last quarter" },
              ].map((row, i) => (
                <div key={i} style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: "12px 0", borderBottom: i < 6 ? "1px solid #1c1c1e" : "none",
                }}>
                  <span style={{ fontSize: 12, color: "#a1a1aa", flex: 1 }}>{row.metric}</span>
                  <span style={{ fontSize: 14, fontWeight: 700, color: "#fafafa", minWidth: 100, textAlign: "right" }}>{row.value}</span>
                  <span style={{ fontSize: 11, color: row.changeColor, minWidth: 100, textAlign: "right" }}>
                    {row.change} <span style={{ color: "#525252" }}>{row.period}</span>
                  </span>
                </div>
              ))}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              {[
                { who: "Founders", use: "\"Am I normal?\" — compare your AI economics to the industry median. Stop guessing. Know." },
                { who: "Investors", use: "\"Is this company healthy?\" — evaluate AI unit economics against the Index before investing." },
                { who: "Journalists", use: "\"What's happening to AI margins?\" — cite the Index as the authoritative source." },
                { who: "Providers", use: "\"How is our pricing perceived?\" — see how customers' realized costs compare to published rates." },
              ].map((item, i) => (
                <div key={i} style={{ padding: 20, background: "#0a0a0a", borderRadius: 6, border: "1px solid #1c1c1e" }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#22c55e", marginBottom: 6 }}>{item.who}</div>
                  <div style={{ fontSize: 12, color: "#71717a", lineHeight: 1.7 }}>{item.use}</div>
                </div>
              ))}
            </div>

            <div style={{ marginTop: 24, padding: 20, background: "#22c55e08", borderRadius: 6, border: "1px solid #22c55e20" }}>
              <div style={{ fontSize: 12, color: "#a1a1aa", lineHeight: 1.8 }}>
                <span style={{ color: "#22c55e", fontWeight: 700 }}>The network effect:</span> every company that joins makes the Index more accurate. Every more accurate Index makes Finault more valuable. Every more valuable Finault attracts more companies. The data is the moat. Nobody else has it. Nobody else can build it.
              </div>
            </div>
          </div>
        )}

        {/* ═══ VERIFIED ═══ */}
        {active === "verified" && (
          <div style={{ animation: "fadeIn 0.5s ease-out" }}>
            <div style={{ fontSize: 10, letterSpacing: 2.5, color: "#f59e0b", marginBottom: 12, fontWeight: 700 }}>PILLAR II</div>
            <p style={{ fontFamily: "'Instrument Serif', serif", fontSize: 40, lineHeight: 1.15, color: "#fafafa", marginBottom: 12, fontStyle: "italic" }}>
              Finault Verified
            </p>
            <p style={{ fontSize: 14, color: "#f59e0b", marginBottom: 32 }}>The market credential for AI financial credibility.</p>

            <p style={{ fontSize: 13, color: "#a1a1aa", lineHeight: 1.9, marginBottom: 32 }}>
              A company that has 6+ months of sealed transaction data, a Finault Score above 60, and an unbroken chain can display the Finault Verified badge. It means: our AI economics are documented, sealed, and independently verifiable by anyone.
            </p>

            {/* Badge */}
            <div style={{ textAlign: "center", margin: "40px 0" }}>
              <div style={{
                display: "inline-flex", alignItems: "center", gap: 12, padding: "16px 32px",
                background: "#0a0a0a", borderRadius: 8, border: "2px solid #f59e0b40",
              }}>
                <div style={{ width: 32, height: 32, borderRadius: "50%", background: "#f59e0b20", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <span style={{ color: "#f59e0b", fontWeight: 800 }}>✓</span>
                </div>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: "#fafafa" }}>Finault Verified</div>
                  <div style={{ fontSize: 10, color: "#71717a" }}>Score: 78 · Chain: 18 months · 142K sealed transactions</div>
                </div>
              </div>
            </div>

            {/* Requirements */}
            <div style={{ background: "#0a0a0a", borderRadius: 8, border: "1px solid #1c1c1e", padding: 28, marginBottom: 24 }}>
              <div style={{ fontSize: 9, letterSpacing: 2, color: "#525252", marginBottom: 16 }}>REQUIREMENTS</div>
              {[
                { req: "6+ months of continuous sealed data", why: "Proves sustained, not one-time, economic tracking" },
                { req: "Finault Score ≥ 60", why: "Minimum standard of AI economic health" },
                { req: "Unbroken seal chain", why: "No gaps, no edits, no retroactive changes" },
                { req: "Revenue data connected (Stripe or manual)", why: "Margin calculations require both sides" },
                { req: "Chain independently verifiable", why: "Anyone can verify without Finault access" },
              ].map((item, i) => (
                <div key={i} style={{
                  display: "flex", gap: 16, padding: "12px 0",
                  borderBottom: i < 4 ? "1px solid #1c1c1e" : "none",
                }}>
                  <span style={{ color: "#f59e0b", fontWeight: 700, flexShrink: 0 }}>✓</span>
                  <div>
                    <div style={{ fontSize: 13, color: "#e4e4e7", fontWeight: 600 }}>{item.req}</div>
                    <div style={{ fontSize: 11, color: "#525252", marginTop: 2 }}>{item.why}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* Who demands it */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              {[
                { who: "Investors", demand: "\"Show me your AI unit economics with proof.\" Companies with Finault Verified get faster diligence and higher confidence." },
                { who: "Enterprise buyers", demand: "\"Prove your AI features deliver value proportional to the price.\" The 2026 renewal cliff demands it." },
                { who: "Auditors", demand: "\"Show me your AI controls and financial records.\" The sealed chain is the evidence pack." },
                { who: "Acquirers", demand: "\"Are their AI margins real?\" An 18-month verified chain IS the diligence." },
              ].map((item, i) => (
                <div key={i} style={{ padding: 20, background: "#0a0a0a", borderRadius: 6, border: "1px solid #1c1c1e" }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#f59e0b", marginBottom: 6 }}>{item.who}</div>
                  <div style={{ fontSize: 12, color: "#71717a", lineHeight: 1.7 }}>{item.demand}</div>
                </div>
              ))}
            </div>

            <div style={{ marginTop: 24, padding: 20, background: "#f59e0b08", borderRadius: 6, border: "1px solid #f59e0b20" }}>
              <div style={{ fontSize: 12, color: "#a1a1aa", lineHeight: 1.8 }}>
                <span style={{ color: "#f59e0b", fontWeight: 700 }}>The adoption path:</span> PCI-DSS didn't become mandatory because one company decided it should. It became mandatory because the market demanded it — merchants required it, banks required it, insurers required it. Finault Verified follows the same path. Once enough buyers and investors ask for it, not having it becomes a competitive disadvantage.
              </div>
            </div>
          </div>
        )}

        {/* ═══ THE OS ═══ */}
        {active === "os" && (
          <div style={{ animation: "fadeIn 0.5s ease-out" }}>
            <div style={{ fontSize: 10, letterSpacing: 2.5, color: "#6366f1", marginBottom: 12, fontWeight: 700 }}>PILLAR III</div>
            <p style={{ fontFamily: "'Instrument Serif', serif", fontSize: 40, lineHeight: 1.15, color: "#fafafa", marginBottom: 12, fontStyle: "italic" }}>
              The AI Financial<br />Operating System
            </p>
            <p style={{ fontSize: 14, color: "#6366f1", marginBottom: 32 }}>Every AI financial operation in one system.</p>

            <p style={{ fontSize: 13, color: "#a1a1aa", lineHeight: 1.9, marginBottom: 32 }}>
              Today, managing AI finances means logging into 5 different dashboards, downloading CSVs, and building spreadsheets. Finault consolidates every AI financial operation into one system — the system of record for AI economics.
            </p>

            <div style={{ display: "grid", gap: 12, marginBottom: 32 }}>
              {[
                { op: "Budget", desc: "Set departmental and per-customer AI budgets. Enforced in real time through the gateway. Not alerts after overspend — prevention before it happens.", icon: "◉", current: "Spreadsheet limits, checked monthly" },
                { op: "Allocate", desc: "Every AI call tagged to customer, feature, department, project. Automatic attribution from headers. No manual tagging.", icon: "◆", current: "Manual cost center mapping in spreadsheets" },
                { op: "Analyze", desc: "Margin per customer, cost per feature, model efficiency, trajectory forecast. The Intelligence Report — updated continuously.", icon: "◈", current: "Quarterly analysis by finance team, 3 weeks late" },
                { op: "Optimize", desc: "Model routing recommendations. Pricing suggestions. Waste detection. Not advice — automated actions through the gateway.", icon: "◇", current: "Ad hoc engineering decisions, no framework" },
                { op: "Invoice", desc: "Compute AI overage charges per customer. Trigger usage-based billing through Stripe. Close the loop between cost and revenue.", icon: "◎", current: "Flat-rate pricing regardless of usage" },
                { op: "Negotiate", desc: "Network-powered benchmarks for provider pricing. Know what peers pay. Get the email template with data to back it up.", icon: "◐", current: "Accept published pricing, no leverage" },
                { op: "Report", desc: "Board deck artifacts. Sealed Close Packs. Finault Score trends. AI P&L at the transaction level. Auto-generated monthly.", icon: "◑", current: "Manually assembled from multiple sources" },
                { op: "Prove", desc: "EU AI Act exports. SOC 2 evidence packs. Chain verification. Sealed receipts. Compliance as a byproduct, not a project.", icon: "◒", current: "No documentation exists" },
              ].map((item, i) => (
                <div key={i} style={{
                  display: "grid", gridTemplateColumns: "auto 1fr 1fr", gap: 16,
                  padding: "16px 20px", background: "#0a0a0a", borderRadius: 6, border: "1px solid #1c1c1e",
                  alignItems: "start",
                }}>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, minWidth: 60 }}>
                    <span style={{ fontSize: 18, color: "#6366f1" }}>{item.icon}</span>
                    <span style={{ fontSize: 11, fontWeight: 800, color: "#e4e4e7" }}>{item.op}</span>
                  </div>
                  <div>
                    <div style={{ fontSize: 9, letterSpacing: 1.5, color: "#6366f1", marginBottom: 4, fontWeight: 600 }}>WITH FINAULT</div>
                    <div style={{ fontSize: 12, color: "#a1a1aa", lineHeight: 1.7 }}>{item.desc}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 9, letterSpacing: 1.5, color: "#525252", marginBottom: 4, fontWeight: 600 }}>WITHOUT FINAULT</div>
                    <div style={{ fontSize: 12, color: "#525252", lineHeight: 1.7, fontStyle: "italic" }}>{item.current}</div>
                  </div>
                </div>
              ))}
            </div>

            <div style={{ padding: 20, background: "#6366f108", borderRadius: 6, border: "1px solid #6366f120" }}>
              <div style={{ fontSize: 12, color: "#a1a1aa", lineHeight: 1.8 }}>
                <span style={{ color: "#6366f1", fontWeight: 700 }}>The lock-in:</span> once a company runs Budget, Allocate, Analyze, Optimize, Invoice, Negotiate, Report, and Prove through Finault — ripping it out means going back to spreadsheets for all eight. That's not switching costs. That's operational dependency. Like removing Stripe from a company that processes payments through it.
              </div>
            </div>
          </div>
        )}

        {/* ═══ THE FLYWHEEL ═══ */}
        {active === "flywheel" && (
          <div style={{ animation: "fadeIn 0.5s ease-out" }}>
            <div style={{ fontSize: 10, letterSpacing: 2.5, color: "#e4e4e7", marginBottom: 12, fontWeight: 700 }}>THE COMPOUNDING ENGINE</div>
            <p style={{ fontFamily: "'Instrument Serif', serif", fontSize: 40, lineHeight: 1.15, color: "#fafafa", marginBottom: 32, fontStyle: "italic" }}>
              The flywheel that makes<br />Finault inevitable.
            </p>

            <div style={{ display: "grid", gap: 8, marginBottom: 40 }}>
              {[
                { step: "1", text: "Company pastes API key → sees Intelligence Report → jaw drops", color: "#22c55e" },
                { step: "2", text: "Connects gateway → receipts on every call → data flows continuously", color: "#22c55e" },
                { step: "3", text: "Connects Stripe → margins computed → underwater customers found", color: "#22c55e" },
                { step: "4", text: "Seal chain grows → switching cost compounds daily", color: "#f59e0b" },
                { step: "5", text: "Data feeds the Index → benchmarks improve → more companies join", color: "#f59e0b" },
                { step: "6", text: "6 months pass → qualifies for Finault Verified → credibility badge", color: "#f59e0b" },
                { step: "7", text: "Investors ask portfolio companies: \"Are you Finault Verified?\"", color: "#6366f1" },
                { step: "8", text: "Enterprise buyers ask vendors: \"Show me your Finault chain\"", color: "#6366f1" },
                { step: "9", text: "Auditors reference AIEI as compliance standard", color: "#6366f1" },
                { step: "10", text: "Not having Finault becomes a red flag. Having it becomes expected.", color: "#e4e4e7" },
              ].map((item, i) => (
                <div key={i} style={{
                  display: "flex", alignItems: "center", gap: 16, padding: "14px 20px",
                  background: "#0a0a0a", borderRadius: 6, border: "1px solid #1c1c1e",
                }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: "50%", background: `${item.color}15`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 11, fontWeight: 800, color: item.color, flexShrink: 0,
                  }}>{item.step}</div>
                  <div style={{ fontSize: 13, color: item.color === "#e4e4e7" ? "#fafafa" : "#a1a1aa", fontWeight: i === 9 ? 700 : 400 }}>{item.text}</div>
                </div>
              ))}
            </div>

            <div style={{
              padding: 40, background: "#0a0a0a", borderRadius: 8,
              border: "1px solid #1c1c1e", textAlign: "center",
            }}>
              <p style={{ fontFamily: "'Instrument Serif', serif", fontSize: 24, color: "#fafafa", fontStyle: "italic", marginBottom: 16 }}>
                They track costs. We track profitability.<br />
                They log data. We seal proof.<br />
                They build tools. We build the financial institution<br />
                for the AI economy.
              </p>
              <p style={{ fontSize: 12, color: "#525252" }}>
                Finault · The AI Economic Intelligence Standard · finault.ai
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

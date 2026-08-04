"use client";

import { FormEvent, useState } from "react";

type Step = { agent: string; detail: string; status: string };

const agents = [
  { initials: "AR", name: "Araştırmacı", role: "Bağlam & içgörü", color: "bg-[#dbe9ff] text-[#315b91]" },
  { initials: "ST", name: "Stratejist", role: "Plan & öncelik", color: "bg-[#eadfff] text-[#614495]" },
  { initials: "ED", name: "Editör", role: "Sentez & sunum", color: "bg-[#ffdfd1] text-[#954d31]" },
];

export default function Home() {
  const [task, setTask] = useState("Yeni dönem veli iletişim planını hazırla");
  const [summary, setSummary] = useState("Ekibin ortak çıktısı burada görünecek. Bir görev verin; uzmanlar araştırma, planlama ve sunum adımlarını birlikte tamamlasın.");
  const [steps, setSteps] = useState<Step[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Görev çalıştırılamadı.");
      setSummary(data.summary);
      setSteps(data.steps);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Beklenmeyen bir hata oluştu.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen overflow-hidden px-4 pb-12 sm:px-7 lg:px-10">
      <div className="orb orb-left" />
      <div className="orb orb-right" />
      <nav className="relative z-10 mx-auto flex max-w-[1440px] items-center justify-between py-6">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-ink text-lime">
            <SparkIcon />
          </div>
          <div>
            <p className="font-display text-[15px] font-extrabold tracking-tight">AI Team Console</p>
            <p className="text-[11px] font-medium text-ink/50">Akıllı ekip çalışma alanı</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden items-center gap-2 rounded-full border border-ink/10 bg-white/60 px-3 py-2 text-xs font-semibold sm:flex">
            <i className="h-2 w-2 rounded-full bg-[#75a548]" /> Demo modu
          </span>
          <button aria-label="Ayarlar" className="grid h-10 w-10 place-items-center rounded-full border border-ink/10 bg-white/60 text-lg">•••</button>
        </div>
      </nav>

      <section className="relative z-10 mx-auto mt-8 max-w-[1440px] lg:mt-14">
        <header className="max-w-3xl">
          <span className="mb-5 inline-flex rounded-full bg-lime/70 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[.18em]">Birlikte düşünen yapay zekâlar</span>
          <h1 className="font-display text-4xl font-extrabold leading-[1.04] tracking-[-.055em] sm:text-6xl lg:text-[72px]">
            Ekibine bir hedef ver.<br /><span className="text-moss">Gerisini birlikte çözsünler.</span>
          </h1>
          <p className="mt-6 max-w-xl text-base leading-7 text-ink/60 sm:text-lg">Uzman yapay zekâ ajanları tek bir çalışma alanında araştırır, planlar ve sonucu anlaşılır bir çıktıya dönüştürür.</p>
        </header>

        <div className="mt-12 grid gap-5 lg:grid-cols-[.82fr_1.18fr]">
          <div className="space-y-5">
            <form onSubmit={submit} className="panel p-6 sm:p-8">
              <div className="mb-5 flex items-center justify-between">
                <div><p className="eyebrow">Yeni görev</p><h2 className="mt-1 font-display text-xl font-bold">Ekip ne üzerinde çalışsın?</h2></div>
                <span className="text-xs font-medium text-ink/35">01</span>
              </div>
              <textarea aria-label="Görev" value={task} onChange={(event) => setTask(event.target.value)} maxLength={1500} className="h-36 w-full resize-none rounded-2xl border border-ink/10 bg-cream/70 p-4 text-[15px] leading-6 outline-none transition focus:border-moss/50 focus:ring-4 focus:ring-moss/5" />
              <div className="mt-4 flex items-center justify-between gap-4">
                <span className="text-xs text-ink/35">{task.length} / 1500</span>
                <button disabled={loading} className="flex items-center gap-2 rounded-xl bg-ink px-5 py-3 text-sm font-bold text-white transition hover:-translate-y-0.5 disabled:opacity-60">
                  {loading ? "Ekip çalışıyor…" : "Ekibi çalıştır"}<span className="text-lime">↗</span>
                </button>
              </div>
              {error && <p role="alert" className="mt-3 text-sm font-medium text-red-700">{error}</p>}
            </form>

            <div className="panel p-6 sm:p-8">
              <div className="flex items-center justify-between"><div><p className="eyebrow">Aktif ekip</p><h2 className="mt-1 font-display text-xl font-bold">3 uzman hazır</h2></div><div className="flex -space-x-2">{agents.map((agent) => <span key={agent.name} className={`grid h-8 w-8 place-items-center rounded-full border-2 border-white text-[9px] font-bold ${agent.color}`}>{agent.initials}</span>)}</div></div>
              <div className="mt-6 divide-y divide-ink/5">{agents.map((agent, index) => <div key={agent.name} className="flex items-center gap-4 py-3.5"><span className={`grid h-10 w-10 place-items-center rounded-xl text-[10px] font-bold ${agent.color}`}>{agent.initials}</span><div className="flex-1"><p className="text-sm font-bold">{agent.name}</p><p className="text-xs text-ink/45">{agent.role}</p></div><span className={`h-2 w-2 rounded-full ${loading && index === 0 ? "animate-pulse bg-amber-400" : "bg-[#83ad62]"}`} /></div>)}</div>
            </div>
          </div>

          <div className="panel relative min-h-[520px] p-6 sm:p-8 lg:p-10">
            <div className="flex items-start justify-between border-b border-ink/5 pb-6">
              <div><p className="eyebrow">Ortak çıktı</p><h2 className="mt-1 font-display text-2xl font-bold">Çalışma özeti</h2></div>
              <span className="rounded-lg bg-[#e7f0e8] px-3 py-1.5 text-[11px] font-bold text-moss">CANLI</span>
            </div>
            <div className="py-8">
              <p className={`max-w-3xl font-display text-xl font-semibold leading-8 text-ink/80 sm:text-2xl sm:leading-9 ${loading ? "animate-pulse" : ""}`}>{summary}</p>
              {steps.length > 0 ? (
                <div className="mt-10 space-y-3">{steps.map((step, index) => <div key={step.agent} className="flex gap-4 rounded-2xl border border-ink/5 bg-cream/50 p-4"><span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-ink text-[10px] font-bold text-lime">{index + 1}</span><div className="flex-1"><div className="flex justify-between gap-3"><p className="text-sm font-bold">{step.agent}</p><span className="text-[10px] font-bold uppercase tracking-wide text-moss">{step.status}</span></div><p className="mt-1 text-sm leading-6 text-ink/50">{step.detail}</p></div></div>)}</div>
              ) : (
                <div className="mt-12 grid place-items-center rounded-3xl border border-dashed border-ink/15 bg-cream/40 px-6 py-14 text-center"><div className="mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-white shadow-sm text-moss"><SparkIcon /></div><p className="text-sm font-bold">Henüz bir çalışma yok</p><p className="mt-1 text-xs text-ink/40">İlk görevinizi yazarak başlayın.</p></div>
              )}
            </div>
            <div className="absolute bottom-6 left-6 right-6 flex items-center justify-between border-t border-ink/5 pt-5 text-[11px] text-ink/35 sm:bottom-8 sm:left-8 sm:right-8"><span>Agents SDK ile desteklenir</span><span>Güvenli sunucu bağlantısı</span></div>
          </div>
        </div>
      </section>
    </main>
  );
}

function SparkIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 fill-none stroke-current" strokeWidth="1.8"><path d="M12 2c.7 6.1 3.9 9.3 10 10-6.1.7-9.3 3.9-10 10-.7-6.1-3.9-9.3-10-10 6.1-.7 9.3-3.9 10-10Z" /></svg>;
}

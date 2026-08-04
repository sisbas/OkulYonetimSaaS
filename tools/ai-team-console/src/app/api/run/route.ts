import { Agent, run } from "@openai/agents";
import { NextResponse } from "next/server";
import { taskRequestSchema } from "@/lib/contracts";

export const runtime = "nodejs";

const demoSteps = [
  { agent: "Araştırmacı", detail: "İhtiyaçları, bağımlılıkları ve riskleri çıkardı.", status: "Tamamlandı" },
  { agent: "Stratejist", detail: "Öncelikli, ölçülebilir bir uygulama planı hazırladı.", status: "Tamamlandı" },
  { agent: "Editör", detail: "Çıktıyı ekip için net bir özete dönüştürdü.", status: "Tamamlandı" },
];

export async function POST(request: Request) {
  const parsed = taskRequestSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
  }

  if (process.env.DEMO_MODE === "true") {
    return NextResponse.json({
      summary: `“${parsed.data.task}” görevi için kapsam netleştirildi. Önce mevcut veriyi doğrulayın, ardından küçük bir pilot uygulayın ve başarı ölçütlerini haftalık izleyin.`,
      steps: demoSteps,
    });
  }

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: "OPENAI_API_KEY tanımlı değil." }, { status: 503 });
  }

  const agent = new Agent({
    name: "Ekip Lideri",
    instructions: "Sen bir AI ekip liderisin. Görevi analiz et ve Türkçe, kısa, uygulanabilir bir plan üret.",
    model: process.env.OPENAI_MODEL || undefined,
  });
  const result = await run(agent, parsed.data.task);

  return NextResponse.json({
    summary: result.finalOutput,
    steps: demoSteps.map((step) => ({ ...step, status: "Tamamlandı" })),
  });
}

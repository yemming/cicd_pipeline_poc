import { fetchResponseByToken } from "@/domain/surveys";
import { RespondForm } from "./_components/respond-form";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ token: string }>;
};

export default async function RespondPage({ params }: Props) {
  const { token } = await params;
  const view = await fetchResponseByToken(token);

  if (!view) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-[#F8F7F4] px-4">
        <div className="bg-white border border-[#EEECE6] rounded-lg p-8 max-w-md w-full text-center">
          <h1 className="text-[16px] font-semibold text-[#2C2C2A]">問卷連結無效</h1>
          <p className="text-[12.5px] text-[#5A5955] mt-2">
            連結可能已失效或網址錯誤，請聯絡客服。
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#F8F7F4] px-4 py-8">
      <div className="max-w-2xl mx-auto">
        <header className="mb-4">
          <div className="text-[11px] tracking-wider text-[#9A9890]">
            {view.template.kind === "sales" ? "銷售滿意度問卷" : "售後服務滿意度問卷"}
          </div>
          <h1 className="text-[18px] font-semibold text-[#2C2C2A] mt-1">
            {view.template.name}
          </h1>
          {view.template.description && (
            <p className="text-[12.5px] text-[#5A5955] mt-2">{view.template.description}</p>
          )}
          {view.customer?.name && (
            <p className="text-[12px] text-[#9A9890] mt-2">
              親愛的 <b className="text-[#2C2C2A]">{view.customer.name}</b>，感謝您撥冗回覆。
            </p>
          )}
        </header>

        <RespondForm
          token={view.response.token}
          status={view.response.status}
          questions={view.template.questions}
          initial={view.response.response_json}
        />
      </div>
    </main>
  );
}

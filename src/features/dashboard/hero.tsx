"use client";

import { Suspense } from "react";
import { FileText, Sparkles } from "lucide-react";
import { useUI, useViewer } from "@/components/layout/ui-context";
import { greeting } from "@/domain/dates";

const BARS = [22, 34, 27, 44];

function Greeting() {
  const { now } = useUI();
  const viewer = useViewer();
  const firstName = viewer.name.split(" ").slice(-1)[0];
  return (
    <>
      {greeting(now)}, {firstName}!
    </>
  );
}

export function Hero() {
  const { now } = useUI();
  return (
    <section className="relative flex min-h-[156px] items-center overflow-hidden rounded-xl border border-[#E5DFF5] bg-gradient-to-r from-[#EBE4FA] via-[#F0ECFB] to-[#F5F2FC] px-6 py-8 md:px-8">
      <div className="relative z-10 max-w-full md:max-w-[70%]">
        <p className="mb-3 text-xs font-medium uppercase tracking-[1.5px] text-[#7054A5]">Không gian của bạn, nhịp điệu của bạn</p>
        <h1 className="text-[28px] font-semibold tracking-[-0.8px] text-[#403260]">
          <Suspense fallback={`${greeting(now)}!`}>
            <Greeting />
          </Suspense>
        </h1>
        <p className="mt-3 text-sm leading-6 text-[#6D6083]">Lịch làm việc, công việc và tài liệu của bạn hôm nay.</p>
      </div>
      <div aria-hidden className="absolute right-6 top-0 hidden h-full w-64 items-center justify-center md:flex">
        <div className="absolute h-56 w-56 rounded-full border border-[#E2D9F4]" />
        <div className="absolute h-40 w-40 rounded-full bg-[#E7DEF6]" />
        <div className="absolute left-5 top-5 -rotate-12 rounded-xl border border-[#E3DBF2] bg-white p-4 text-[#8F78C5]">
          <FileText className="h-14 w-14" />
          <div className="mt-3 h-1.5 w-14 rounded bg-[#E4DCF5]" />
          <div className="mt-2 h-1.5 w-10 rounded bg-[#ECE6F6]" />
        </div>
        <div className="absolute bottom-5 right-4 rotate-6 rounded-xl border border-[#E3DBF2] bg-white px-5 py-4">
          <div className="mb-3 h-1.5 w-16 rounded bg-[#E7DFF6]" />
          <div className="flex h-12 items-end gap-2">
            {BARS.map((height, index) => (
              <span key={index} className="w-3 rounded-t bg-[#AF9ADC]" style={{ height }} />
            ))}
          </div>
        </div>
        <Sparkles className="absolute right-4 top-5 h-5 w-5 text-[#A28ACB]" />
      </div>
    </section>
  );
}

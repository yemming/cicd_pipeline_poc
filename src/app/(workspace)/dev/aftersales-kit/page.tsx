"use client";

import { useSetPageHeader } from "@/components/page-header-context";
import { TabsShell, TabDef } from "@/components/aftersales-kit/tabs-shell";
import { TabPreInspection } from "@/components/aftersales-kit/tab-preinspection";
import { TabRO } from "@/components/aftersales-kit/tab-ro";
import { TabPDINew } from "@/components/aftersales-kit/tab-pdi-new";
import { TabPDIUsed } from "@/components/aftersales-kit/tab-pdi-used";
import { TabDelivery } from "@/components/aftersales-kit/tab-delivery";
import { TabWarranty } from "@/components/aftersales-kit/tab-warranty";
import { TabServiceSchedule } from "@/components/aftersales-kit/tab-service-schedule";

const TABS: TabDef[] = [
  { key: "preinspect",  number: "1", name: "預檢單",         hint: "SA 環檢報價",     tone: "red",     render: () => <TabPreInspection /> },
  { key: "ro",          number: "2", name: "正式工單",       hint: "Repair Order",    tone: "orange",  render: () => <TabRO /> },
  { key: "pdi-new",     number: "3", name: "新車 PDI",       hint: "Pre-Delivery",    tone: "amber",   render: () => <TabPDINew /> },
  { key: "pdi-used",    number: "4", name: "中古車 PDI",     hint: "CPO/DPO/PO",      tone: "green",   render: () => <TabPDIUsed /> },
  { key: "delivery",    number: "5", name: "客戶交車確認",   hint: "Bike Delivery",   tone: "teal",    render: () => <TabDelivery /> },
  { key: "warranty",    number: "6", name: "保固條款登記",   hint: "Warranty Terms",  tone: "blue",    render: () => <TabWarranty /> },
  { key: "schedule",    number: "7", name: "保養工時表",     hint: "Service Schedule",tone: "violet",  render: () => <TabServiceSchedule /> },
];

export default function AfterSalesKitPage() {
  useSetPageHeader({
    breadcrumb: [
      { label: "新功能開發區" },
      { label: "Ducati 售後完整工單套件 v4" },
    ],
  });

  return (
    <div className="max-w-[1400px] mx-auto">
      <TabsShell tabs={TABS} />
    </div>
  );
}

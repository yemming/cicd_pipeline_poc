import { ServiceDemoProvider } from "@/lib/service-demo/context";

export default function ServiceLayout({ children }: { children: React.ReactNode }) {
  return <ServiceDemoProvider>{children}</ServiceDemoProvider>;
}

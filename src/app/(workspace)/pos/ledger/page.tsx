import { LedgerView } from "@/components/pos/ledger-view";
import { MOCK_LEDGER } from "@/lib/pos/mock-ledger";

export default function LedgerPage() {
  return <LedgerView initialEntries={MOCK_LEDGER} />;
}

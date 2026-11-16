import type { Metadata } from "next";
import FinanceDemo from "./finance-demo";

export const metadata: Metadata = {
  title: "UniBOS · Cash payment demo",
  description: "Synthetic browser-only cash shift and payment workflow.",
};

export default function FinanceDemoPage() {
  return <FinanceDemo />;
}

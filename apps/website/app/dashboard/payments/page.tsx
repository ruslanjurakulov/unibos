import type { Metadata } from "next";
import CashPayments from "./payments";

export const metadata: Metadata = {
  title: "UniBOS · Cash payments",
  description: "Authenticated internal cash settlement.",
};

export default function CashPaymentsPage() {
  return <CashPayments />;
}

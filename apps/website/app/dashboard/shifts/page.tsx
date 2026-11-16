import type { Metadata } from "next";
import CashShifts from "./shifts";

export const metadata: Metadata = {
  title: "UniBOS · Cash shifts",
  description: "Authenticated cashier shift management.",
};

export default function CashShiftsPage() {
  return <CashShifts />;
}

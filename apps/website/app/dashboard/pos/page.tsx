import type { Metadata } from "next";
import IntegratedPos from "./integrated-pos";

export const metadata: Metadata = {
  title: "UniBOS · Kassir POS",
  description: "Autentifikatsiyalangan kassir buyurtmalari.",
};

export default function CashierPosPage() {
  return <IntegratedPos />;
}

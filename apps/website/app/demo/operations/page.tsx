import type { Metadata } from "next";
import OperationsDemo from "./operations-demo";

export const metadata: Metadata = {
  title: "UniBOS · Katalog va stollar demo",
  description:
    "Mahsulotlar, filial narxlari, mavjudlik va QR stol boshqaruvi uchun interaktiv demo.",
};

export default function OperationsPage() {
  return <OperationsDemo />;
}

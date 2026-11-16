import type { Metadata } from "next";
import PosDemo from "./pos-demo";

export const metadata: Metadata = {
  title: "UniBOS · Kassir POS demo",
  description:
    "Kassir uchun stolli va olib ketiladigan buyurtma yaratish demosini sinab ko‘ring.",
};

export default function PosPage() {
  return <PosDemo />;
}

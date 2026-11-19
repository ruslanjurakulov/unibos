import type { Metadata } from "next";
import ServiceDemo from "./service-demo";

export const metadata: Metadata = {
  title: "UniBOS · Ofitsiant va oshxona demo",
  description:
    "Kassirdan oshxonaga va ofitsiantga boradigan sintetik buyurtma oqimi.",
};

export default function ServiceDemoPage() {
  return <ServiceDemo />;
}

import type { Metadata } from "next";
import { DesignPage } from "../site/design-page";

export const metadata: Metadata = {
  title: "Help and FAQ · UniBOS",
  description:
    "Answers about the UniBOS product, demos, pricing, device support and security boundaries.",
};

export default function FaqPage() {
  return <DesignPage page="faq" />;
}

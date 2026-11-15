import type { Metadata } from "next";
import { DesignPage } from "../site/design-page";

export const metadata: Metadata = {
  title: "Security and trust · UniBOS",
  description:
    "See which UniBOS security controls have local implementation and test evidence, and what remains before production.",
};

export default function SecurityPage() {
  return <DesignPage page="security" />;
}

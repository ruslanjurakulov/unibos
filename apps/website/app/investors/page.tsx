import type { Metadata } from "next";
import { DesignPage } from "../site/design-page";

export const metadata: Metadata = {
  title: "Investors and partners · UniBOS",
  description:
    "An evidence-led introduction to UniBOS's restaurant-first business operating system and product direction.",
};

export default function InvestorsPage() {
  return <DesignPage page="investors" />;
}

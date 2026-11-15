import type { Metadata } from "next";
import { DesignPage } from "../site/design-page";

export const metadata: Metadata = {
  title: "UniBOS product demos",
  description:
    "Explore the UniBOS restaurant, guest QR menu and platform administration interface demos.",
};

export default function DemoHubPage() {
  return <DesignPage page="demoHub" />;
}

import type { Metadata } from "next";
import Analytics from "./analytics";

export const metadata: Metadata = {
  title: "UniBOS · Branch analytics",
  robots: { index: false, follow: false },
};
export default function AnalyticsPage() {
  return <Analytics />;
}

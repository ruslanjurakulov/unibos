import type { Metadata } from "next";
import StaffWorkspace from "../service/staff-workspace";

export const metadata: Metadata = { title: "UniBOS · Kitchen display" };
export default function KitchenPage() {
  return <StaffWorkspace role="kitchen" />;
}

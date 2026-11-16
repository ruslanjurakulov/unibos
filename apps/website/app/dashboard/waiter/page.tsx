import type { Metadata } from "next";
import StaffWorkspace from "../service/staff-workspace";

export const metadata: Metadata = { title: "UniBOS · Waiter workspace" };
export default function WaiterPage() {
  return <StaffWorkspace role="waiter" />;
}

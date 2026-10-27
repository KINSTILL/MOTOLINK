import { redirect } from "next/navigation";

export default function LegacyTicketsRedirectPage() {
  redirect("/subscription");
}

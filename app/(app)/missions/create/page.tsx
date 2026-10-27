import { redirect } from "next/navigation";

export default function CreateMissionRedirect() {
  redirect("/missions/new");
}

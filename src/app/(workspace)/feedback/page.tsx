import { redirect } from "next/navigation";

export default function FeedbackIndexPage() {
  redirect("/feedback/tickets");
}

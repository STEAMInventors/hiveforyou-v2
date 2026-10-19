import { redirect } from "next/navigation";

/**
 * Legacy document-discovery upload path (Stage 1 Hybrid Front Door supersedes this route).
 * Always send users back to home intake.
 */
export default function ProcessingPage() {
  redirect("/");
}

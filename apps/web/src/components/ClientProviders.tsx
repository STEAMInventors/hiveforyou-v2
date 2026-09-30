import { StagedDocumentsProvider } from "@/lib/intake/staged-documents-context";

export function ClientProviders({ children }: { children: React.ReactNode }) {
  return <StagedDocumentsProvider>{children}</StagedDocumentsProvider>;
}

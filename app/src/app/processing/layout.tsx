import { HiveFooter } from "@/components/HiveFooter";
import { HiveHeader } from "@/components/HiveHeader";

export default function ProcessingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <HiveHeader />
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col items-center px-4 py-6 sm:px-6 md:min-h-[calc(100vh-8rem)] md:py-10">
        {children}
      </main>
      <HiveFooter />
    </>
  );
}

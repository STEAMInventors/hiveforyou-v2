import { HiveFooter } from "@/components/HiveFooter";

import { HiveHeader } from "@/components/HiveHeader";

import { UploadExperience } from "@/components/UploadExperience";



export default function UploadPage() {

  return (

    <>

      <HiveHeader />

      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col items-center justify-center px-6 py-10 md:py-16">

        <UploadExperience />

      </main>

      <HiveFooter />

    </>

  );

}


import { NextResponse } from "next/server";

export async function POST(_request: Request) {
  if (process.env.NODE_ENV === "development") {
    console.warn(
      "[api/discover/run] DEPRECATED: legacy discover run rejected (410). Use home intake (HiveHomeComposer).",
    );
  }
  return NextResponse.json(
    {
      error: "DEPRECATED",
      message:
        "Legacy document discovery is no longer available. Upload and start a hive from the home page.",
    },
    { status: 410 },
  );
}

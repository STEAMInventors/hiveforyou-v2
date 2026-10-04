import {
  HIVE_EVENT_PING,
  hivePingEventDataSchema,
} from "@hiveforyou/shared/events";

import { readWorkerEnv } from "../../env.js";
import { createWorkerAdminSupabase, countCasesForUser } from "../../supabase/admin.js";
import { inngest } from "../client.js";

export const hivePing = inngest.createFunction(
  { id: "hive-ping", triggers: [{ event: HIVE_EVENT_PING }] },
  async ({ event, step }) => {
    const data = hivePingEventDataSchema.parse(event.data);

    await step.run("ack", () => ({ ok: true as const }));

    const caseCount = await step.run("count-user-cases", async () => {
      const env = readWorkerEnv();
      const supabase = createWorkerAdminSupabase(env);
      return countCasesForUser(supabase, data.userId);
    });

    return caseCount;
  },
);

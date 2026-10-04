import "server-only";

import { Inngest } from "inngest";

import { HIVE_INNGEST_APP_ID } from "@hiveforyou/shared/events";

export const inngest = new Inngest({ id: HIVE_INNGEST_APP_ID });

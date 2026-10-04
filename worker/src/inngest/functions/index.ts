import { hiveIntake } from "./hive-intake.js";
import { hivePing } from "./hive-ping.js";

export const workerFunctions = [hivePing, hiveIntake];

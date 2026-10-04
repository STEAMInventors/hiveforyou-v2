import { hiveIntake } from "./hive-intake.js";
import { hivePing } from "./hive-ping.js";
import { hiveStudy } from "./hive-study.js";

export const workerFunctions = [hivePing, hiveIntake, hiveStudy];

import "@testing-library/jest-dom/vitest";

vi.mock("server-only", () => ({}));
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

afterEach(() => {
  cleanup();
});

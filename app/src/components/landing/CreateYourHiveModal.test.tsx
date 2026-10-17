import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CreateYourHiveModal } from "./CreateYourHiveModal";

describe("CreateYourHiveModal", () => {
  it("shows validation errors from the parent and does not submit", () => {
    const onSubmit = vi.fn();
    render(
      <CreateYourHiveModal
        open
        previewMode
        domainId="iep"
        domainLabel="Special Education / IEP"
        hiveName=""
        hiveDescription=""
        nameError="Give your Hive a name so you can find it later."
        onHiveNameChange={() => undefined}
        onHiveDescriptionChange={() => undefined}
        onCancel={() => undefined}
        onSubmit={onSubmit}
      />,
    );

    expect(screen.getByTestId("landing-create-hive-name-error")).toBeInTheDocument();
    expect(screen.getByTestId("landing-create-hive-domain")).toHaveTextContent(
      "Special Education / IEP",
    );
    fireEvent.click(screen.getByTestId("landing-create-hive-submit"));
    expect(onSubmit).toHaveBeenCalled();
  });

  it("calls cancel without submitting", () => {
    const onCancel = vi.fn();
    const onSubmit = vi.fn();
    render(
      <CreateYourHiveModal
        open
        domainId="iep"
        domainLabel={null}
        hiveName="Maya's IEP"
        hiveDescription=""
        onHiveNameChange={() => undefined}
        onHiveDescriptionChange={() => undefined}
        onCancel={onCancel}
        onSubmit={onSubmit}
      />,
    );

    fireEvent.click(screen.getByTestId("landing-create-hive-cancel"));
    expect(onCancel).toHaveBeenCalledOnce();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

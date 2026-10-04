import { fireEvent, render, screen } from "@testing-library/react";

import { describe, expect, it, vi } from "vitest";



import { HiveHomeComposer } from "./HiveHomeComposer";



vi.mock("@hiveforyou/domain-packs", () => ({

  listDomainPacksByCapability: () => [

    { id: "iep", name: "Special Education / IEP" },

    { id: "medicaid", name: "Medicaid" },

    { id: "bankruptcy", name: "Bankruptcy" },

  ],

}));



function attachPdf(container: HTMLElement) {
  const file = new File(["pdf"], "report.pdf", { type: "application/pdf" });

  const input = container.querySelector('input[type="file"]') as HTMLInputElement;

  fireEvent.change(input, { target: { files: [file] } });

}



describe("HiveHomeComposer", () => {

  it("lists registry-driven domain pills in the composer", () => {
    render(<HiveHomeComposer onSubmit={vi.fn()} />);

    expect(screen.getByTestId("hive-composer-domain-iep")).toHaveTextContent("IEP");
    expect(screen.getByTestId("hive-composer-domain-medicaid")).toBeInTheDocument();
  });



  it("requires intent or explicit domain before send", () => {

    const onSubmit = vi.fn();

    const { container } = render(<HiveHomeComposer onSubmit={onSubmit} />);



    expect(screen.getByTestId("hive-composer-submit")).toBeDisabled();



    attachPdf(container);

    expect(screen.getByTestId("hive-composer-submit")).toBeDisabled();



    fireEvent.change(screen.getByTestId("hive-composer-intent"), {

      target: { value: "Preparing for an IEP meeting" },

    });

    expect(screen.getByTestId("hive-composer-submit")).not.toBeDisabled();

  });



  it("toggles domain selection and attachment chips inside the composer", () => {
    const onSubmit = vi.fn();
    const { container } = render(<HiveHomeComposer onSubmit={onSubmit} />);

    const iepPill = screen.getByTestId("hive-composer-domain-iep");
    fireEvent.click(iepPill);
    expect(iepPill).toHaveAttribute("aria-pressed", "true");

    attachPdf(container);
    expect(screen.getByTestId("hive-composer-attachment-chip")).toHaveTextContent("report.pdf");

    fireEvent.click(iepPill);
    expect(iepPill).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(screen.getAllByTestId("hive-composer-attachment-remove")[0]!);
    expect(screen.queryByTestId("hive-composer-attachment-chip")).not.toBeInTheDocument();
  });



  it("submits explicit IEP domain with attachments", () => {

    const onSubmit = vi.fn();

    const { container } = render(<HiveHomeComposer onSubmit={onSubmit} />);



    fireEvent.change(screen.getByTestId("hive-composer-intent"), {

      target: { value: "IEP Prep" },

    });

    fireEvent.click(screen.getByTestId("hive-composer-domain-iep"));

    attachPdf(container);

    fireEvent.click(screen.getByTestId("hive-composer-submit"));



    expect(onSubmit).toHaveBeenCalledOnce();

    expect(onSubmit.mock.calls[0]?.[0]).toMatchObject({

      rawIntent: "IEP Prep",

      explicitDomainId: "iep",

    });

    expect(onSubmit.mock.calls[0]?.[0].files).toHaveLength(1);

  });

});


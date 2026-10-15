import type {
  HiveWriterDomainBinding,
  HiveWriterPresentationBinding,
  HiveWriterProposal,
} from "@hiveforyou/shared/hive-writer-proposal";

export class HiveWriterProposalValidationError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "HiveWriterProposalValidationError";
    this.code = code;
  }
}

function assertBindingEqual(
  field: keyof HiveWriterDomainBinding,
  expected: HiveWriterDomainBinding,
  actual: HiveWriterDomainBinding,
): void {
  if (expected[field] !== actual[field]) {
    throw new HiveWriterProposalValidationError(
      "WRITER_BINDING_MISMATCH",
      `Proposal domainBinding.${field} does not match resolved binding.`,
    );
  }
}

function assertPresentationEqual(
  field: keyof HiveWriterPresentationBinding,
  expected: HiveWriterPresentationBinding,
  actual: HiveWriterPresentationBinding,
): void {
  if (expected[field] !== actual[field]) {
    throw new HiveWriterProposalValidationError(
      "WRITER_BINDING_MISMATCH",
      `Proposal presentationBinding.${field} does not match resolved binding.`,
    );
  }
}

export function assertWriterProposalEnvelope(input: {
  proposal: HiveWriterProposal;
  domainBinding: HiveWriterDomainBinding;
  presentationBinding: HiveWriterPresentationBinding;
}): void {
  const { proposal, domainBinding, presentationBinding } = input;

  for (const key of Object.keys(domainBinding) as (keyof HiveWriterDomainBinding)[]) {
    assertBindingEqual(key, domainBinding, proposal.domainBinding);
  }

  for (const key of Object.keys(presentationBinding) as (keyof HiveWriterPresentationBinding)[]) {
    assertPresentationEqual(key, presentationBinding, proposal.presentationBinding);
  }
}

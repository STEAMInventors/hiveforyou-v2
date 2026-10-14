from pathlib import Path

READER = Path(__file__).resolve().parents[1] / "src/hive_agents/reader.py"

BLOCK = '''@dataclass(frozen=True)
class ReaderVerifyContext:
    case_id: str
    user_id: str


class VerifierBackedReaderTools:
    """Reader tools that delegate ``propose_fact`` to the TypeScript verifier."""

    def __init__(
        self,
        pages: list[DocumentPage],
        verifier_client: Any,
        context: ReaderVerifyContext,
    ) -> None:
        self._inner = InMemoryReaderTools(pages)
        self._verifier_client = verifier_client
        self._context = context
        self.last_rejection_reasons: list[str] | None = None

    @property
    def proposed_facts(self) -> list[CandidateFact]:
        return self._inner.proposed_facts

    def list_documents(self) -> list[DocumentSummary]:
        return self._inner.list_documents()

    def read_pages(self, document_id: str, page_numbers: list[int]) -> list[DocumentPage]:
        return self._inner.read_pages(document_id, page_numbers)

    def search(
        self,
        query: str,
        *,
        document_ids: list[str] | None = None,
    ) -> list[SearchHit]:
        return self._inner.search(query, document_ids=document_ids)

    def propose_fact(self, fact: CandidateFactDraft) -> str:
        from hive_agents.verifier_client import ReaderVerifierError

        try:
            result = self._verifier_client.verify_fact(
                case_id=self._context.case_id,
                user_id=self._context.user_id,
                fact=fact,
            )
        except ReaderVerifierError as exc:
            self.last_rejection_reasons = [str(exc)]
            return f"REJECTED: {exc}"

        if not result.accepted:
            self.last_rejection_reasons = list(result.reasons)
            joined = "; ".join(result.reasons)
            return f"REJECTED: {joined}"

        self.last_rejection_reasons = None
        return self._inner.propose_fact(fact)


'''

def main() -> None:
    text = READER.read_text(encoding="utf-8")
    anchor = 'class InMemoryReaderTools:\n    """In-memory tool backend for tests and offline Reader runs."""'
    if "class ReaderVerifyContext" not in text:
        if anchor not in text:
            raise SystemExit("anchor missing")
        text = text.replace(anchor, BLOCK + anchor, 1)

    text = text.replace(
        "    tools: ReaderTools | None = None,\n    limits: ReaderExecutionLimits | None = None,",
        "    tools: ReaderTools | None = None,\n"
        "    verifier_client: Any | None = None,\n"
        "    verify_context: ReaderVerifyContext | None = None,\n"
        "    limits: ReaderExecutionLimits | None = None,",
        1,
    )
    text = text.replace(
        "    inner_tools: ReaderTools = tools or InMemoryReaderTools(pages)\n"
        "    bounded_tools = BoundedReaderTools(inner_tools, budget)",
        "    if tools is not None:\n"
        "        inner_tools: ReaderTools = tools\n"
        "    elif verifier_client is not None and verify_context is not None:\n"
        "        inner_tools = VerifierBackedReaderTools(pages, verifier_client, verify_context)\n"
        "    else:\n"
        "        inner_tools = InMemoryReaderTools(pages)\n"
        "    bounded_tools = BoundedReaderTools(inner_tools, budget)",
        1,
    )
    text = text.replace(
        '    "ReaderTools",\n    "SearchHit",',
        '    "ReaderTools",\n'
        '    "ReaderVerifyContext",\n'
        '    "SearchHit",\n'
        '    "VerifierBackedReaderTools",',
        1,
    )
    READER.write_text(text, encoding="utf-8", newline="\n")
    print("patched", READER)


if __name__ == "__main__":
    main()

import { ArrowRight } from "lucide-react";
import Link from "next/link";

export function AnswerQuestionsCta() {
  return (
    <div className="flex w-full flex-col items-center gap-2 text-center">
      <Link
        href="/questions"
        data-testid="answer-questions-cta"
        className="flex w-full items-center justify-center gap-3 rounded-hive-xl bg-hive-sage px-9 py-4 font-sans text-base font-bold text-hive-text-inverse shadow-hive-lg transition-all hover:-translate-y-0.5 hover:bg-hive-sage-muted hover:shadow-hive-lg sm:w-auto md:text-lg"
      >
        <span>Answer a few questions</span>
        <ArrowRight className="h-5 w-5" strokeWidth={2} aria-hidden />
      </Link>
    </div>
  );
}

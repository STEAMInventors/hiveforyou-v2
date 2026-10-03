import { STAGES } from "./stages";

function CheckIcon({ color }: { color: string }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="10" fill={color} />
      <path
        d="m7.5 12.5 3 3 6-6.5"
        fill="none"
        stroke="#fff"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SpinIcon({ color }: { color: string }) {
  return (
    <svg className="spin" width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="9" fill="none" stroke="#E8EAED" strokeWidth="3" />
      <path
        d="M12 3a9 9 0 0 1 9 9"
        fill="none"
        stroke={color}
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

function DotIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="9" fill="none" stroke="#DADCE0" strokeWidth="2" />
    </svg>
  );
}

export function StageList({
  stages,
  current,
  finishedThrough,
}: {
  stages: number[];
  current: number;
  finishedThrough: number;
}) {
  return (
    <ol aria-live="polite">
      {stages.map((index) => {
        const stage = STAGES[index];
        if (!stage) {
          return null;
        }
        const state = index <= finishedThrough ? "past" : index === current ? "now" : "later";
        return (
          <li key={stage.key} className={state}>
            <span className="ic">
              {state === "past" ? <CheckIcon color={stage.color} /> : null}
              {state === "now" ? <SpinIcon color={stage.color} /> : null}
              {state === "later" ? <DotIcon /> : null}
            </span>
            <span className="tx">
              <em>
                {index + 1} · {stage.name}
              </em>
              <b>{stage.title}</b>
              <small>{stage.text}</small>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

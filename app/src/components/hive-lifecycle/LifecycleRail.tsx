import { STAGES } from "./stages";

export function LifecycleRail({
  current,
  finishedThrough,
}: {
  current: number;
  finishedThrough: number;
}) {
  return (
    <div className="rail">
      {STAGES.map((stage, index) => {
        const state = index <= finishedThrough ? "past" : index === current ? "now" : "later";
        const width = state === "past" ? 100 : state === "now" ? 55 : 0;
        return (
          <div key={stage.key} className={state}>
            <i>
              <b style={{ width: `${width}%`, background: stage.color }} />
            </i>
            <span>
              {index + 1} {stage.name}
            </span>
          </div>
        );
      })}
    </div>
  );
}

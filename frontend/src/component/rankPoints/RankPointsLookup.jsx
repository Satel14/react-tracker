import React, { useId, useState } from "react";
import { rpPercentile } from "../../helpers/rankPercentile";

// Counted out of a hundred and always upwards, the same rule the player page's
// percentile line follows: "top 6%" asks the reader to invert it before they
// can tell whether it is good, and most do not.
const OUT_OF = 100;

// Past this the second clause is dropped. The "top n%" idiom only carries for
// small numbers, and it would read worst for the players it reads worst for.
const TOP_UP_TO = 50;

// Progressive enhancement, and it earns the name: the table this reads is
// already in the HTML, so placing a visitor costs no request. Which is also
// why the whole control disappears rather than degrades when there is no
// table -- there is nothing for it to be enhanced from.
const RankPointsLookup = ({ t, table }) => {
  const [entered, setEntered] = useState("");
  const inputId = useId();

  if (!table) return null;

  const at = entered.trim() === "" ? null : rpPercentile(entered.trim(), table);
  const below = at === null ? null : OUT_OF - at;

  return (
    <div className="rank-points__lookup">
      <h3>{t("pages.rankPoints.lookup.heading")}</h3>

      <label className="rank-points__lookup-label" htmlFor={inputId}>
        {t("pages.rankPoints.lookup.label")}
      </label>
      <input
        className="rank-points__lookup-input"
        id={inputId}
        type="number"
        inputMode="numeric"
        min="0"
        placeholder={t("pages.rankPoints.lookup.placeholder")}
        value={entered}
        onChange={(event) => setEntered(event.target.value)}
      />

      <p className="rank-points__lookup-result" aria-live="polite">
        {below === null ? (
          t("pages.rankPoints.lookup.blank")
        ) : (
          <>
            {t("pages.rankPoints.lookup.result", { rp: entered.trim(), n: below })}
            {at <= TOP_UP_TO && (
              <span className="rank-points__lookup-top">
                {t("pages.rankPoints.lookup.top", { percent: at })}
              </span>
            )}
          </>
        )}
      </p>
    </div>
  );
};

export default RankPointsLookup;

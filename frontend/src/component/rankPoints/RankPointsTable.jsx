import React from "react";
import { getLanguage } from "react-switch-lang";
import { rpTable } from "../../helpers/censusSnapshot";
import { rpCuts, rpMedian } from "../../helpers/rankPercentile";

// "division.bro.official.pc-2018-43" -> "43". The dictionaries supply the word
// around it so the sentence reads as Ukrainian in Ukrainian.
const seasonNumber = (seasonId) =>
  (typeof seasonId === "string" && seasonId.match(/(\d+)\s*$/)?.[1]) || "";

const groupDigits = (value) =>
  new Intl.NumberFormat(getLanguage() === "ua" ? "uk-UA" : "en-US").format(Number(value) || 0);

// Only the shard the census is drawn from has a label; the collector pins
// shard = "steam", so anything else prints its own name rather than a
// translation nobody wrote.
const platformLabel = (t, shard) =>
  shard === "steam" ? t("pages.rankPoints.platform") : shard || "";

const RankPointsTable = ({ t, data }) => {
  const payload = data ?? {};
  const table = rpTable(payload);

  // The empty state is the launch state, so it is a first-class branch: the
  // prose around this component still answers the question.
  //
  // It names no season, and cannot: the payload that reaches this branch is by
  // definition the ARCHIVED reading -- the last season with enough days behind
  // it -- never the one being collected. Production shipped the other way round
  // and read "Collection for Season 42 has only just started" five days after
  // season 42 ended. `finished` below keeps its season, because it renders
  // beside that season's own table.
  if (!table) {
    return <p className="rank-points__note">{t("pages.rankPoints.gathering")}</p>;
  }

  return (
    <div className="rank-points__table-wrap">
      <p className="rank-points__lead">
        {t("pages.rankPoints.lead", { rp: groupDigits(rpMedian(table)) })}
      </p>

      <table className="rank-points__table">
        <caption className="rank-points__table-caption">
          {t("pages.rankPoints.table.heading")}
        </caption>
        <thead>
          <tr>
            <th scope="col">{t("pages.rankPoints.table.standingHeader")}</th>
            <th scope="col">{t("pages.rankPoints.table.rpHeader")}</th>
          </tr>
        </thead>
        <tbody>
          {rpCuts(table).map((cut) => (
            <tr key={cut.above}>
              <th scope="row">{t("pages.rankPoints.table.above", { percent: cut.above })}</th>
              <td>{groupDigits(cut.rp)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {payload.current === false && (
        <p className="rank-points__stale">
          {t("pages.rankPoints.finished", { season: seasonNumber(payload.seasonId) })}
        </p>
      )}

      <p className="rank-points__note">
        {t("pages.rankPoints.sample", {
          accounts: groupDigits(payload.accounts),
          matches: groupDigits(payload.matches),
          platform: platformLabel(t, payload.shard),
          from: payload.firstDate,
          to: payload.lastDate,
        })}
      </p>
    </div>
  );
};

export default RankPointsTable;

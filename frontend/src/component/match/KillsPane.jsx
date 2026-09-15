import React, { useMemo, useState } from "react";
import { Segmented, Slider } from "antd";
import KillMap from "./KillMap";
import KillFeed from "./KillFeed";
import { filterKills } from "../../helpers/killFilter";
import { formatClock as fmt } from "../../helpers/formatClock";

// Owns the Kills tab. The map and the feed are two readings of one list, and
// they used to hold a filter each -- the time range on the map, All/Mine on the
// feed -- so moving either left the other showing a different set of kills
// under the same heading. Both controls live here now and feed both views.
const KillsPane = ({ kills = [], rawMapName, duration = 0, platform, t }) => {
  const [range, setRange] = useState(null);
  const [focalOnly, setFocalOnly] = useState(false);
  const [highlightId, setHighlightId] = useState(null);

  // Numbered before anything is filtered, so a feed row and the tracer it
  // points at stay the same kill however the list is later narrowed.
  const all = useMemo(() => kills.map((k, id) => ({ ...k, id })), [kills]);
  const visible = useMemo(() => filterKills(all, { range, focalOnly }), [all, range, focalOnly]);

  const span = duration || 0;

  return (
    <div className="kills-pane">
      <div className="kills-pane__controls">
        <Segmented
          value={focalOnly ? "focal" : "all"}
          onChange={(value) => setFocalOnly(value === "focal")}
          options={[
            { value: "all", label: t("pages.match.filterAll") },
            { value: "focal", label: t("pages.match.filterFocal") },
          ]}
        />
        <span className="kills-pane__range">
          <span className="kills-pane__range-label">{t("pages.match.timeRange")}</span>
          <Slider
            range
            min={0}
            max={span}
            value={range || [0, span]}
            onChange={setRange}
            tooltip={{ formatter: (v) => fmt(v) }}
            style={{ flex: 1, minWidth: 160 }}
          />
        </span>
        {/* Two sentences rather than one that always reads "3 of 3": an
            untouched filter has no fraction worth printing. */}
        <span className="kills-pane__count">
          {visible.length === all.length
            ? t("pages.match.killsTotal", { total: all.length })
            : t("pages.match.killsShown", { shown: visible.length, total: all.length })}
        </span>
      </div>

      <div className="kills-pane__layout">
        <div className="kills-pane__map">
          <KillMap kills={visible} rawMapName={rawMapName} highlightId={highlightId} t={t} />
        </div>
        <div className="kills-pane__feed">
          <KillFeed
            kills={visible}
            platform={platform}
            t={t}
            highlightId={highlightId}
            onHighlight={setHighlightId}
            // A match with no kills and a filter that matched none are two
            // different facts; "no kills recorded" under an active filter
            // reads as a broken page.
            emptyLabel={all.length ? t("pages.match.noKillsFiltered") : undefined}
          />
        </div>
      </div>
    </div>
  );
};

export default KillsPane;

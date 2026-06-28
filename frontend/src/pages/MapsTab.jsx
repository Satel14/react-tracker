import React, { useState } from "react";
import { Select } from "antd";
import { translate } from "react-switch-lang";
import AggregateHeatmap from "../component/charts/AggregateHeatmap";

const MapsTab = ({ matches = [], shard, accountId, playerName, t }) => {
  const playedMaps = Array.from(
    new Map(
      matches.filter((m) => m && m.rawMapName).map((m) => [m.rawMapName, { value: m.rawMapName, label: m.mapName || m.rawMapName }])
    ).values()
  );
  const [selectedMap, setSelectedMap] = useState(playedMaps[0]?.value || "Baltic_Main");

  return (
    <div className="maps-tab">
      <p className="maps-tab__description">{t("pages.maps.description")}</p>

      <div className="maps-tab__controls">
        <span className="maps-tab__label">{t("pages.maps.selectMap")}</span>
        <Select className="maps-tab__select" value={selectedMap} onChange={setSelectedMap} options={playedMaps} />
      </div>

      <AggregateHeatmap
        rawMapName={selectedMap}
        matches={matches}
        shard={shard}
        accountId={accountId}
        playerName={playerName}
        t={t}
      />
    </div>
  );
};

export default translate(MapsTab);

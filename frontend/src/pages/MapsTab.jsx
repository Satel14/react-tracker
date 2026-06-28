import React, { useState } from "react";
import { Select } from "antd";
import { translate } from "react-switch-lang";
import MatchHeatmap from "../component/charts/MatchHeatmap";

const MapsTab = ({ matches = [], shard, accountId, playerName, t }) => {
  const options = matches
    .filter((m) => m && m.id)
    .map((m) => ({
      value: m.id,
      label: `${m.mapName || m.rawMapName || "?"} · ${m.gameModeLabel || ""}`.trim(),
      rawMapName: m.rawMapName,
      mapName: m.mapName,
    }));

  const [selectedId, setSelectedId] = useState(options[0]?.value || null);
  const selected = options.find((o) => o.value === selectedId) || null;

  return (
    <div className="maps-tab">
      <div className="maps-tab__controls">
        <span className="maps-tab__label">{t("pages.maps.selectMatch")}</span>
        <Select
          className="maps-tab__select"
          value={selectedId}
          onChange={setSelectedId}
          options={options}
          placeholder={t("pages.maps.selectMatch")}
        />
      </div>

      {selected ? (
        <MatchHeatmap
          open
          inline
          onClose={() => {}}
          matchId={selected.value}
          shard={shard}
          accountId={accountId}
          playerName={playerName}
          mapNameHint={selected.mapName}
          rawMapNameHint={selected.rawMapName}
        />
      ) : (
        <p className="maps-tab__empty">{t("pages.maps.noMatches")}</p>
      )}
    </div>
  );
};

export default translate(MapsTab);

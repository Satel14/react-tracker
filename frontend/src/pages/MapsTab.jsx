import React, { useState } from "react";
import { Select, Segmented } from "antd";
import { translate } from "react-switch-lang";
import MatchHeatmap from "../component/charts/MatchHeatmap";
import AggregateHeatmap from "../component/charts/AggregateHeatmap";

const MapsTab = ({ matches = [], shard, accountId, playerName, t }) => {
  const options = matches
    .filter((m) => m && m.id)
    .map((m) => ({
      value: m.id,
      label: [m.mapName || m.rawMapName || "?", m.gameModeLabel].filter(Boolean).join(" · "),
      rawMapName: m.rawMapName,
      mapName: m.mapName,
    }));

  const [selectedId, setSelectedId] = useState(options[0]?.value || null);
  const selected = options.find((o) => o.value === selectedId) || null;

  const [mode, setMode] = useState("single");

  const playedMaps = Array.from(
    new Map(
      matches.filter((m) => m && m.rawMapName).map((m) => [m.rawMapName, { value: m.rawMapName, label: m.mapName || m.rawMapName }])
    ).values()
  );
  const [selectedMap, setSelectedMap] = useState(playedMaps[0]?.value || "Baltic_Main");

  return (
    <div className="maps-tab">
      <Segmented
        className="maps-tab__mode"
        value={mode}
        onChange={setMode}
        options={[
          { value: "single", label: t("pages.maps.modeSingle") },
          { value: "aggregate", label: t("pages.maps.modeAggregate") },
        ]}
      />

      {mode === "aggregate" ? (
        <>
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
        </>
      ) : (
        <>
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
        </>
      )}
    </div>
  );
};

export default translate(MapsTab);

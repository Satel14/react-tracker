import React from "react";

// The standings' footprint, drawn with nothing in it.
//
// /leaderboards was the worst page on the site for layout shift (0.262 local,
// 0.351 in production) for one reason: the static shell put the heading and the
// explainer next to each other, while the live page puts ~2,950px of filters,
// meta line and table between them. Everything below -- the whole explainer and
// the footer -- was shoved off the screen the moment React mounted.
//
// CLS only counts what is on screen when it moves, so that first insertion is
// the whole cost; anything that grows afterwards has already been pushed out of
// view and is nearly free. Raising the skeleton's row count without this block
// made the page WORSE (0.262 -> 0.374), because it made that first insertion
// taller. Reserving the space is what fixes it.
//
// Deliberately plain DOM. The obvious version of this is antd's own Table with
// empty rows -- but antd's Table is not in the main bundle and pulling it in
// costs +266KB on every route, homepage included. The geometry is ours instead:
// the row and header heights are pinned in style.scss and the real table obeys
// the same values, so the two cannot drift.
import { PAGE_SIZE } from "./leaderboardLayout.js";

const LeaderboardReserve = () => (
  <>
    <div className="leaderboard-page__filters leaderboard-page__filters--reserved" aria-hidden="true" />
    <div className="leaderboard-page__meta leaderboard-page__meta--reserved" aria-hidden="true" />
    <div
      className="leaderboard-page__table-reserve"
      // The row count travels as a custom property so PAGE_SIZE stays the one
      // source of truth: change it in JS and the reserved box follows.
      style={{ "--lb-rows": PAGE_SIZE }}
      aria-hidden="true"
    />
  </>
);

export default LeaderboardReserve;

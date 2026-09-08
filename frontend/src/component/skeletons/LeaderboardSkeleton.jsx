import React from "react";
import { Table } from "antd";
import { SkeletonFrame } from "../Skeleton";

// Renders the page's real Table with the real columns and empty rows, so the
// header, the column widths and the horizontal scroll are already the ones the
// standings will use. Sorters come off the placeholder columns: there is
// nothing to sort, and a sortable header invites a click that does nothing.
const LeaderboardSkeleton = ({ label, columns = [], rows = 10 }) => {
  const placeholderColumns = columns.map((column) => ({
    title: column.title,
    key: column.key,
    width: column.width,
    responsive: column.responsive,
    render: () => <span className="skeleton skeleton--cell" aria-hidden="true" />,
  }));

  const placeholderRows = Array.from({ length: rows }, (_, index) => ({ key: index }));

  return (
    <SkeletonFrame label={label}>
      <Table
        className="leaderboard-page__table"
        columns={placeholderColumns}
        dataSource={placeholderRows}
        // The standings pass rowSelection, so antd prepends a checkbox column.
        // Leaving it out here shifts every column sideways once data lands.
        // Disabled, because there is nothing to select yet.
        rowSelection={{ hideSelectAll: true, getCheckboxProps: () => ({ disabled: true }) }}
        pagination={false}
        scroll={{ x: 720 }}
        size="middle"
      />
    </SkeletonFrame>
  );
};

export default LeaderboardSkeleton;

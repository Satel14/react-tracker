// The one number behind the standings' height, kept in a module that pulls in
// nothing: the reserved box and the Suspense fallback need it, and neither can
// afford to import Leaderboard.jsx, which carries antd's Table.
//
// It is the table's page size, the skeleton's row count and the number of rows
// the reserved box leaves space for. Those were 50, 10 and nothing at all.
export const PAGE_SIZE = 50;

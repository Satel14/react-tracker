import React from "react";

const EmptyState = ({ children, className = "" }) => (
  <p className={`empty-state ${className}`.trim()}>{children}</p>
);

export default EmptyState;

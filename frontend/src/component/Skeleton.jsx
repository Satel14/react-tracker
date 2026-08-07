import React from "react";

const Skeleton = ({ variant = "block", count = 1, label, className = "" }) => (
  <div className={`skeleton-group ${className}`.trim()} role="status" aria-busy="true">
    {Array.from({ length: count }, (_, index) => (
      <span key={index} className={`skeleton skeleton--${variant}`} aria-hidden="true" />
    ))}
    <span className="sr-only">{label}</span>
  </div>
);

export default Skeleton;

import React from "react";

export default function VisibleOnly({ visible, children }) {
  if (!visible) return null;

  return <>{children}</>;
}
import { ReactNode } from "react";
import { PlatformShell } from "@/components/platform/platform-shell";

type PlatformLayoutProps = {
  children: ReactNode;
};

const PlatformLayout = ({ children }: PlatformLayoutProps) => {
  return <PlatformShell>{children}</PlatformShell>;
};

export default PlatformLayout;

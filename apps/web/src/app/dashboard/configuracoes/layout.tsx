import { ReactNode } from 'react';
import ConfigurationShell from '@/components/configuration-shell';

export default function ConfigurationLayout({ children }: { children: ReactNode }) {
  return <ConfigurationShell>{children}</ConfigurationShell>;
}

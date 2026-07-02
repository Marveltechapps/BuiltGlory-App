import React from 'react';
import * as LucideIcons from 'lucide-react-native';
import { HelpCircle } from 'lucide-react-native';

function toPascal(name: string) {
  return name
    .split('-')
    .map((s) => (s ? s[0].toUpperCase() + s.slice(1) : ''))
    .join('');
}

const cache: Record<string, any> = {};

function resolveIcon(name: string) {
  if (cache[name]) return cache[name];
  const pascal = toPascal(name);
  const Comp = (LucideIcons as any)[pascal];
  if (Comp) {
    cache[name] = Comp;
    return Comp;
  }
  return null;
}

type IconProps = {
  name: string;
  size?: number;
  color?: string;
  fill?: string;
  strokeWidth?: number;
  style?: any;
  className?: string;
};

export default function Icon({ name, size = 20, color = '#0F172A', fill = 'none', strokeWidth = 2, style }: IconProps) {
  const Comp = resolveIcon(name) || HelpCircle;
  return <Comp size={size} color={color} fill={fill} strokeWidth={strokeWidth} style={style} />;
}

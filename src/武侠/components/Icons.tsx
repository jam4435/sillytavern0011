
import {
  ArrowLeft,
  Backpack,
  BookOpen,
  Bug,
  ChevronDown,
  ChevronUp,
  Compass,
  Copy,
  Database,
  Eye,
  FileText,
  Map as MapIcon,
  RotateCw,
  Scroll,
  Send,
  Settings,
  Sparkles,
  Sword,
  Search,
  ToggleLeft,
  ToggleRight,
  User,
  Users,
  X
} from 'lucide-react';
import React from 'react';

interface IconProps {
  className?: string;
  size?: number;
  color?: string;
}

interface IconWrapperProps {
  children: React.ReactNode;
  className?: string;
}

// Explicitly typed wrapper to satisfy TypeScript children requirements
const IconWrapper = ({ children, className = "" }: IconWrapperProps) => (
  <span className={`icon-wrap ${className}`} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
    {children}
  </span>
);

export const Icons = {
  Quest: ({ className, size, color }: IconProps) => <IconWrapper className={className}><Scroll size={size || 20} color={color} /></IconWrapper>,
  Character: ({ className, size, color }: IconProps) => <IconWrapper className={className}><User size={size || 20} color={color} /></IconWrapper>,
  Map: ({ className, size, color }: IconProps) => <IconWrapper className={className}><MapIcon size={size || 20} color={color} /></IconWrapper>,
  Social: ({ className, size, color }: IconProps) => <IconWrapper className={className}><Users size={size || 20} color={color} /></IconWrapper>,
  Inventory: ({ className, size, color }: IconProps) => <IconWrapper className={className}><Backpack size={size || 20} color={color} /></IconWrapper>,
  Send: ({ className, size, color }: IconProps) => <IconWrapper className={className}><Send size={size || 18} color={color} /></IconWrapper>,
  Compass: ({ className, size, color }: IconProps) => <IconWrapper className={className}><Compass size={size || 24} color={color} /></IconWrapper>,
  Combat: ({ className, size, color }: IconProps) => <IconWrapper className={className}><Sword size={size || 24} color={color} /></IconWrapper>,
  Close: ({ className, size, color }: IconProps) => <IconWrapper className={className}><X size={size || 24} color={color} /></IconWrapper>,
  Settings: ({ className, size, color }: IconProps) => <IconWrapper className={className}><Settings size={size || 20} color={color} /></IconWrapper>,
  Magic: ({ className, size, color }: IconProps) => <IconWrapper className={className}><Sparkles size={size || 16} color={color} /></IconWrapper>,
  Manual: ({ className, size, color }: IconProps) => <IconWrapper className={className}><BookOpen size={size || 20} color={color} /></IconWrapper>,
  Scroll: ({ className, size, color }: IconProps) => <IconWrapper className={className}><Scroll size={size || 48} color={color} /></IconWrapper>,
  ToggleLeft: ({ className, size, color }: IconProps) => <IconWrapper className={className}><ToggleLeft size={size || 20} color={color} /></IconWrapper>,
  ToggleRight: ({ className, size, color }: IconProps) => <IconWrapper className={className}><ToggleRight size={size || 20} color={color} /></IconWrapper>,
  ChevronUp: ({ className, size, color }: IconProps) => <IconWrapper className={className}><ChevronUp size={size || 20} color={color} /></IconWrapper>,
  ChevronDown: ({ className, size, color }: IconProps) => <IconWrapper className={className}><ChevronDown size={size || 20} color={color} /></IconWrapper>,
  Debug: ({ className, size, color }: IconProps) => <IconWrapper className={className}><Bug size={size || 20} color={color} /></IconWrapper>,
  Refresh: ({ className, size, color }: IconProps) => <IconWrapper className={className}><RotateCw size={size || 20} color={color} /></IconWrapper>,
  Variables: ({ className, size, color }: IconProps) => <IconWrapper className={className}><Database size={size || 20} color={color} /></IconWrapper>,
  Search: ({ className, size, color }: IconProps) => <IconWrapper className={className}><Search size={size || 18} color={color} /></IconWrapper>,
  Eye: ({ className, size, color }: IconProps) => <IconWrapper className={className}><Eye size={size || 18} color={color} /></IconWrapper>,
  ArrowLeft: ({ className, size, color }: IconProps) => <IconWrapper className={className}><ArrowLeft size={size || 18} color={color} /></IconWrapper>,
  Copy: ({ className, size, color }: IconProps) => <IconWrapper className={className}><Copy size={size || 18} color={color} /></IconWrapper>,
  FileText: ({ className, size, color }: IconProps) => <IconWrapper className={className}><FileText size={size || 18} color={color} /></IconWrapper>,
};

import type { ButtonHTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'gold';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  fullWidth?: boolean;
}

const base =
  'inline-flex items-center justify-center gap-2 rounded-xl font-bold transition-all active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none focus:outline-none focus-visible:ring-2 focus-visible:ring-azure/50';

const variants: Record<Variant, string> = {
  primary: 'bg-azure text-white shadow-lg shadow-azure/30 hover:brightness-110',
  secondary: 'glass text-white hover:bg-white/10',
  ghost: 'border border-white/15 text-silver font-semibold hover:bg-white/5',
  danger: 'bg-red-500 text-white hover:brightness-110',
  gold: 'bg-gold text-navy font-black hover:brightness-110',
};

const sizes: Record<Size, string> = {
  sm: 'px-4 py-2.5 text-sm',
  md: 'px-6 py-3',
  lg: 'px-6 py-4 text-lg',
};

export function Button({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  className,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(base, variants[variant], sizes[size], fullWidth && 'w-full', className)}
      {...rest}
    />
  );
}

import { cn } from "@/lib/utils"

interface GlassButtonProps {
  children: React.ReactNode
  onClick?: () => void
  disabled?: boolean
  className?: string
  size?: "sm" | "md"
}

export function GlassButton({ children, onClick, disabled, className, size = "sm" }: GlassButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex items-center justify-center rounded-[8px] select-none cursor-pointer",
        "transition-all duration-150 active:scale-[0.97]",
        "bg-white/70 backdrop-blur-md",
        "border border-white/80 shadow-[0_1px_6px_rgba(0,0,0,0.08),inset_0_0_0_0.5px_rgba(255,255,255,0.75)]",
        "hover:bg-white/90 hover:shadow-[0_2px_10px_rgba(0,0,0,0.11),inset_0_0_0_0.5px_rgba(255,255,255,0.9)]",
        "text-foreground/80",
        size === "sm" ? "px-3 py-1 text-xs font-medium" : "px-4 py-1.5 text-sm font-medium",
        disabled && "opacity-35 cursor-not-allowed pointer-events-none",
        className
      )}
    >
      {children}
    </button>
  )
}

interface GlassPillProps {
  children: React.ReactNode
  className?: string
}

export function GlassPill({ children, className }: GlassPillProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-[10px] px-3 py-1",
        "bg-white/70 backdrop-blur-md",
        "border border-white/80 shadow-[0_1px_6px_rgba(0,0,0,0.07),inset_0_0_0_0.5px_rgba(255,255,255,0.75)]",
        "text-[12px] text-foreground/60 select-none",
        className
      )}
    >
      {children}
    </span>
  )
}

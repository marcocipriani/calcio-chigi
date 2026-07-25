import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"

export function AttendanceRing({
  name,
  avatarUrl,
  percentage,
  size = 64,
}: {
  name: string
  avatarUrl?: string | null
  percentage: number
  size?: number
}) {
  const strokeWidth = 4
  const radius = size / 2 - strokeWidth
  const circumference = 2 * Math.PI * radius
  const clamped = Math.max(0, Math.min(100, percentage))

  return (
    <span
      aria-label={`${name}, ${Math.round(clamped)}% di presenze`}
      className="relative inline-flex shrink-0 items-center justify-center"
      style={{ height: size, width: size }}
    >
      <svg
        aria-hidden="true"
        className="absolute inset-0 -rotate-90"
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        width={size}
      >
        <circle
          className="stroke-muted"
          cx={size / 2}
          cy={size / 2}
          fill="none"
          r={radius}
          strokeWidth={strokeWidth}
        />
        <circle
          className="stroke-primary transition-[stroke-dashoffset] duration-200 motion-reduce:transition-none"
          cx={size / 2}
          cy={size / 2}
          fill="none"
          r={radius}
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - clamped / 100)}
          strokeLinecap="round"
          strokeWidth={strokeWidth}
        />
      </svg>
      <Avatar style={{ height: size - 12, width: size - 12 }}>
        <AvatarImage alt="" className="object-cover" src={avatarUrl ?? undefined} />
        <AvatarFallback className="text-[10px] font-bold">
          {name
            .split(" ")
            .slice(0, 2)
            .map((part) => part[0])
            .join("")}
        </AvatarFallback>
      </Avatar>
      <span className="absolute -bottom-1 rounded-full border bg-background px-1.5 py-0.5 text-[9px] font-black tabular-nums shadow-xs">
        {Math.round(clamped)}%
      </span>
    </span>
  )
}
